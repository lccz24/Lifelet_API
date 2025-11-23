require('dotenv').config();

const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");

const app = express();

// Middleware CORS para permitir requests do seu app Flutter
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  next();
});

app.use(express.json());

// CONFIGURAÇÃO SIMPLES PARA AIVEN
const getDbConfig = () => {
  console.log("Conectando ao Aiven MySQL");
  return {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: {
      rejectUnauthorized: false
    }
  };
};

// Pool de conexões
const pool = mysql.createPool(getDbConfig());

// Rota de cadastro
app.post("/cadastro", async (req, res) => {
  try {
    console.log("Recebida requisição de cadastro:", req.body);
    
    const { nomeCompleto, email, telefone, senha, userName, funcao } = req.body;

    if (!nomeCompleto || !email || !telefone || !senha || !userName || !funcao) {
      return res.status(400).send({ ok: false, msg: "Todos os campos são obrigatórios." });
    }

    // Verifica se já existe email ou username
    const [verifica] = await pool.execute(
      "SELECT * FROM usuario WHERE Email = ? OR UserName = ?",
      [email, userName]
    );
    
    if (verifica.length > 0) {
      return res.status(400).send({ ok: false, msg: "Email ou usuário já cadastrado." });
    }

    // Cria hash da senha
    const hash = await bcrypt.hash(senha, 10);

    // Insere usuário
    const [result] = await pool.execute(
      "INSERT INTO usuario (NomeCompleto, Email, Telefone, Senha, UserName, Funcao) VALUES (?, ?, ?, ?, ?, ?)",
      [nomeCompleto, email, telefone, hash, userName, funcao]
    );

    console.log("Usuário cadastrado com sucesso. ID:", result.insertId);
    
    res.send({
      ok: true,
      msg: "Usuário cadastrado com sucesso.",
      userId: result.insertId,
      funcao: funcao,
    });

  } catch (err) {
    console.error("Erro em /cadastro:", err);
    res.status(500).send({ ok: false, msg: "Erro no servidor." });
  }
});

// Rota de login
app.post("/login", async (req, res) => {
  try {
    console.log("Recebida requisição de login:", req.body);
    
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).send({ ok: false, msg: "Email e senha obrigatórios." });
    }

    const [rows] = await pool.execute("SELECT * FROM usuario WHERE Email = ?", [email]);

    if (rows.length === 0) {
      return res.status(401).send({ ok: false, msg: "Usuário não encontrado." });
    }

    const user = rows[0];
    const senhaValida = await bcrypt.compare(senha, user.Senha);

    if (!senhaValida) {
      return res.status(401).send({ ok: false, msg: "Senha inválida." });
    }

    res.send({
      ok: true,
      msg: "Login bem-sucedido.",
      userId: user.UserID,
      funcao: user.Funcao,
    });

  } catch (err) {
    console.error("Erro em /login:", err);
    res.status(500).send({ ok: false, msg: "Erro no servidor." });
  }
});

// Rota de saúde para verificar se a API está funcionando
app.get("/health", async (req, res) => {
  try {
    await pool.execute("SELECT 1");
    res.send({ ok: true, msg: "API e banco de dados funcionando normalmente" });
  } catch (err) {
    console.error("Erro no health check:", err);
    res.status(500).send({ ok: false, msg: "Erro na conexão com o banco de dados" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));


// POST CONECTAR RESPONSAVEL E USUARIO

app.post("/conectar", async (req, res) => {
  try {
    const { id_usuario, id_responsavel } = req.body;

    if (!id_usuario || !id_responsavel) {
      return res.status(400).send({ ok: false, msg: "IDs são obrigatórios." });
    }

    // Verificar se ambos existem
    const [u] = await pool.execute("SELECT * FROM usuario WHERE UserID = ?", [id_usuario]);
    const [r] = await pool.execute("SELECT * FROM usuario WHERE UserID = ?", [id_responsavel]);

    if (!u.length || !r.length) {
      return res.status(404).send({ ok: false, msg: "Usuário ou responsável não encontrado." });
    }

    // Verificar função
    if (u[0].Funcao != 1) {
      return res.status(400).send({ ok: false, msg: "Este ID não pertence a um usuário comum." });
    }
    if (r[0].Funcao != 2) {
      return res.status(400).send({ ok: false, msg: "Este ID não pertence a um responsável." });
    }

    // Criar vínculo
    await pool.execute(
      "INSERT INTO conexao (id_usuario, id_responsavel) VALUES (?, ?)",
      [id_usuario, id_responsavel]
    );

    res.send({ ok: true, msg: "Responsável conectado com sucesso!" });

  } catch (err) {
    console.error("Erro em /conectar:", err);
    res.status(500).send({ ok: false, msg: "Erro no servidor." });
  }
});

// GET BUSCA RESPONSAVEIS DE UM USUARIO

app.get("/usuario/:id/responsaveis", async (req, res) => {
  try {
    const userId = req.params.id;

    const [rows] = await pool.execute(
      `SELECT r.UserID, r.NomeCompleto, r.Email, r.Telefone
       FROM conexao c
       JOIN usuario r ON r.UserID = c.id_responsavel
       WHERE c.id_usuario = ?`,
       [userId]
    );

    res.send(rows);

  } catch (err) {
    console.error("Erro em /usuario/responsaveis:", err);
    res.status(500).send({ ok: false, msg: "Erro no servidor." });
  }
});

// GET BUSCA USUARIOS DE UM RESPONSAVEL

app.get("/responsavel/:id/usuarios", async (req, res) => {
  try {
    const respId = req.params.id;

    const [rows] = await pool.execute(
      `SELECT u.UserID, u.NomeCompleto, u.Email, u.Telefone
       FROM conexao c
       JOIN usuario u ON u.UserID = c.id_usuario
       WHERE c.id_responsavel = ?`,
      [respId]
    );

    res.send(rows);

  } catch (err) {
    console.error("Erro em /responsavel/usuarios:", err);
    res.status(500).send({ ok: false, msg: "Erro no servidor." });
  }
});

// Rota para buscar usuário por email
app.get("/buscar-usuario", async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).send({ ok: false, msg: "Email é obrigatório." });
    }

    const [rows] = await pool.execute(
      "SELECT UserID, NomeCompleto, Email, Funcao FROM usuario WHERE Email = ?",
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).send({ ok: false, msg: "Usuário não encontrado." });
    }

    res.send({ ok: true, user: rows[0] });

  } catch (err) {
    console.error("Erro em /buscar-usuario:", err);
    res.status(500).send({ ok: false, msg: "Erro no servidor." });
  }
});

// Rota para remover conexão
app.delete("/conectar", async (req, res) => {
  try {
    const { id_usuario, id_responsavel } = req.body;

    if (!id_usuario || !id_responsavel) {
      return res.status(400).send({ ok: false, msg: "IDs são obrigatórios." });
    }

    await pool.execute(
      "DELETE FROM conexao WHERE id_usuario = ? AND id_responsavel = ?",
      [id_usuario, id_responsavel]
    );

    res.send({ ok: true, msg: "Conexão removida com sucesso!" });

  } catch (err) {
    console.error("Erro em DELETE /conectar:", err);
    res.status(500).send({ ok: false, msg: "Erro no servidor." });
  }
});
