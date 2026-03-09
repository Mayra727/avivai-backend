import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   VARIÁVEIS
========================= */

const PORT = process.env.PORT;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "avivai_secret";

/* =========================
   MODELO USER
========================= */

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String
});

const User = mongoose.model("User", UserSchema);

/* =========================
   ROTAS
========================= */

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "AVIVAI API"
  });
});

app.get("/health", (req, res) => {
  res.send("API online");
});

/* =========================
   REGISTRO
========================= */

app.post("/register", async (req, res) => {

  try {

    const { name, email, password } = req.body;

    const userExist = await User.findOne({ email });

    if (userExist) {
      return res.status(400).json({
        error: "Usuário já existe"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword
    });

    res.json({
      message: "Usuário criado",
      userId: user._id
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      error: "Erro ao registrar"
    });

  }

});

/* =========================
   LOGIN
========================= */

app.post("/login", async (req, res) => {

  try {

    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        error: "Usuário não encontrado"
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({
        error: "Senha inválida"
      });
    }

    const token = jwt.sign(
      { id: user._id },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      name: user.name,
      userId: user._id
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      error: "Erro no login"
    });

  }

});

/* =========================
   START SERVER
========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});