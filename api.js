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