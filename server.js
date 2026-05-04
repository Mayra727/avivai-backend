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

const LessonSchema = new mongoose.Schema({
  title: String,
  type: String,
  content: String,
  cover: String
});

const ModuleSchema = new mongoose.Schema({
  title: String,
  lessons: [LessonSchema]
});

const CourseSchema = new mongoose.Schema({
  title: String,

  price: {
    type: Number,
    default: 0
  },

  modules: [ModuleSchema],

  creatorId: String,

  createdAt: {
    type: Date,
    default: Date.now
  }
});

delete mongoose.models.Course;

const Course =
  mongoose.models.Course ||
  mongoose.model("Course", CourseSchema);

console.log(
  "🔥 SCHEMA REAL:",
  Course.schema.obj.modules[0].lessons
);

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

app.get("/producer-courses/:creatorId", async (req, res) => {

  try {

    const courses = await Course.find({
      creatorId: req.params.creatorId
    });

    res.json(courses);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      error: "Erro ao buscar cursos"
    });
  }
});

// =========================
// 🔥 CRIAR CURSO (BLINDADO)
// =========================
app.post("/courses", async (req, res) => {

  console.log("🔥 BACKEND ATIVO");
  console.log("BODY:", req.body);
  console.log(
  "🔥 TYPE LESSON:",
  typeof req.body.modules?.[0]?.lessons?.[0]
);

console.log(
  "🔥 VALUE LESSON:",
  req.body.modules?.[0]?.lessons?.[0]
);

  try {

    let { title, price, modules, creatorId } = req.body;

    // 🔥 garante array
    if (!Array.isArray(modules)) {
      modules = [];
    }

    // 🔥 limpa módulos
    const safeModules = modules.map((m) => {

      let lessons = [];

      // 🔥 só aceita array
      if (Array.isArray(m.lessons)) {
        lessons = m.lessons;
      }

      const safeLessons = [];

      for (const l of lessons) {

        let lesson = l;

        // 💣 se lesson vier string
        if (typeof lesson === "string") {

          console.log("🚨 LESSON STRING:", lesson);

          try {

            lesson = JSON.parse(lesson);

            // 🔥 se virar array
            if (Array.isArray(lesson)) {
              lesson = lesson[0];
            }

          } catch {

            console.log("❌ STRING INVÁLIDA IGNORADA");
            continue;
          }
        }

        // 🔥 garante objeto
        if (!lesson || typeof lesson !== "object") {
          continue;
        }

        safeLessons.push({
          title: lesson.title || "",
          type: lesson.type || "video",
          content: lesson.content || "",
          cover: lesson.cover || ""
        });
      }

      return {
        title: m.title || "",
        lessons: safeLessons
      };
    });

    // 🔥 cria curso
    const course = await Course.create({
      title: title || "",
      price: Number(price) || 0,
      modules: safeModules,
      creatorId
    });

    res.status(201).json(course);

  } catch (error) {

    console.log("❌ ERRO:", error);

    res.status(500).json({
      error: "Erro ao criar curso"
    });
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

  try {

    let { email, password } = req.body;

    // 🔥 limpa email
    email = email.trim().toLowerCase();

    console.log("EMAIL RECEBIDO:", email);

    const user = await User.findOne({
      email: {
        $regex: new RegExp(`^${email}$`, "i")
      }
    });

    console.log("USER ENCONTRADO:", user);

    if (!user) {
      return res.status(400).json({
        error: "Não encontrado"
      });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(400).json({
        error: "Senha inválida"
      });
    }

    const token = jwt.sign({
      id: user._id,
      name: user.name,
      role: user.role
    }, JWT_SECRET);

    res.json({
      token,
      user
    });

  } catch (error) {

    console.log("ERRO LOGIN:", error);

    res.status(500).json({
      error: "Erro no login"
    });
  }
});

// =========================
// START
// =========================
app.listen(PORT, () => {
  console.log("🚀 Rodando na porta", PORT);
});