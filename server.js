// =========================
// IMPORTS
// =========================
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";

dotenv.config();

// =========================
// CONFIG
// =========================
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "secret";

// =========================
// DB
// =========================
mongoose.connect(MONGO_URI)
  .then(() => console.log("🟢 MongoDB conectado"))
  .catch(err => console.log("Erro Mongo:", err));

// =========================
// MODELS
// =========================
const Course = mongoose.model("Course", new mongoose.Schema({
  title: String,
  price: { type: Number, default: 0 },
  modules: [
    {
      title: String,
      lessons: [
        {
          title: String,
          type: String,
          content: String,
          cover: String
        }
      ]
    }
  ],
  creatorId: String,
  createdAt: { type: Date, default: Date.now }
}));

const User = mongoose.model("User", new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: {
    type: String,
    enum: ["superadmin", "produtor", "aluno"],
    default: "aluno"
  }
}));

// =========================
// AUTH
// =========================
app.get("/me", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Token não enviado" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json(decoded);
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
});

// =========================
// 🔥 CRIAR CURSO (BLINDADO)
// =========================
app.post("/courses", async (req, res) => {

  console.log("🔥 BACKEND ATIVO");
  console.log("BODY:", req.body);

  try {
    let { title, price, modules, creatorId } = req.body;

    const safeModules = modules.map((m) => {

  let safeLessons = [];

  if (Array.isArray(m.lessons)) {

    safeLessons = m.lessons
      .map((l) => {

        // 💣 CASO REAL: lesson veio como string "[ { ... } ]"
        if (typeof l === "string") {
          console.log("🚨 STRING DETECTADA NA LESSON:", l);

          try {
            const parsed = JSON.parse(l);

            if (Array.isArray(parsed)) {
              return parsed[0]; // pega o objeto dentro
            }

            return parsed;

          } catch {
            return null;
          }
        }

        // 🔥 se não for objeto válido
        if (!l || typeof l !== "object") {
          return null;
        }

        return {
          title: l.title || "",
          type: l.type || "video",
          content: l.content || "",
          cover: l.cover || ""
        };
      })
      .filter(Boolean);
  }

  return {
    title: m.title || "",
    lessons: safeLessons
  };
});

    const course = await Course.create({
      title: title || "",
      price: Number(price) || 0,
      modules: safeModules,
      creatorId
    });

    res.status(201).json(course);

  } catch (error) {
    console.log("❌ ERRO:", error);
    res.status(500).json({ error: "Erro ao criar curso" });
  }
});

// =========================
// GET CURSO
// =========================
app.get("/courses/:id", async (req, res) => {
  const course = await Course.findById(req.params.id);
  res.json(course);
});

// =========================
// DELETE
// =========================
app.delete("/courses/:id", async (req, res) => {
  await Course.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// =========================
// REGISTER
// =========================
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ error: "Já existe" });

  const hashed = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    password: hashed
  });

  res.json(user);
});

// =========================
// LOGIN
// =========================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: "Não encontrado" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: "Senha inválida" });

  const token = jwt.sign({
    id: user._id,
    name: user.name,
    role: user.role
  }, JWT_SECRET);

  res.json({ token, user });
});

// =========================
// START
// =========================
app.listen(PORT, () => {
  console.log("🚀 Rodando na porta", PORT);
});