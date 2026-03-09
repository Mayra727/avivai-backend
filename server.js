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
   CONEXÃO MONGODB
========================= */

const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
  console.log("❌ MONGO_URI não encontrada");
}

mongoose
  .connect(mongoURI)
  .then(() => console.log("🟢 MongoDB conectado"))
  .catch((err) => console.log("🔴 Erro MongoDB:", err));

/* =========================
   MODEL USER
========================= */

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
});

const User = mongoose.model("User", UserSchema);

/* =========================
   TESTE
========================= */

app.get("/", (req, res) => {
  res.send("Backend AVIVAI rodando 🚀");
});

/* =========================
   REGISTRO
========================= */

app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    res.json({
      message: "Usuário criado com sucesso",
      user,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Erro ao registrar usuário" });
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
        error: "Usuário não encontrado",
      });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({
        error: "Senha inválida",
      });
    }

    const token = jwt.sign(
      { id: user._id },
      "segredo_avivai",
      { expiresIn: "7d" }
    );

    res.json({
      token,
      userId: user._id,
      name: user.name,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      error: "Erro no login",
    });
  }
});

/* =========================
   SERVER
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});