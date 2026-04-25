// =========================
// IMPORTS
// =========================
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { MercadoPagoConfig, Preference } from "mercadopago";
import PDFDocument from "pdfkit";
import fetch from "node-fetch";
import path from "path";
import fs from "fs";

dotenv.config();

// =========================
// CONFIG
// =========================
const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "avivai_secret";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

// =========================
// APP
// =========================
const app = express();
app.use(cors());
app.use(express.json());

// =========================
// DB
// =========================
mongoose.connect(MONGO_URI)
  .then(() => console.log("🟢 MongoDB conectado"))
  .catch((err) => console.error("Erro Mongo:", err));

// =========================
// MODELOS
// =========================
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

const Course = mongoose.models.Course || mongoose.model("Course", new mongoose.Schema({
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

const Book = mongoose.model("Book", new mongoose.Schema({
  title: String,
  cover: String,
  url: String,
  createdAt: { type: Date, default: Date.now }
}));

const Lesson = mongoose.model("Lesson", new mongoose.Schema({
  courseId: String,
  title: String,
  contentType: {
    type: String,
    enum: ["video", "pdf"],
    default: "video"
  },
  videoUrl: String,
  pdfUrl: String,
  order: Number
}));

const Purchase = mongoose.model("Purchase", new mongoose.Schema({
  userId: String,
  courseId: String,
  paymentId: String,
  createdAt: { type: Date, default: Date.now }
}));

// =========================
// AUTH /ME
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
// 🔥 CRIAR CURSO (FIX PRINCIPAL)
// =========================
app.post("/courses", async (req, res) => {
  console.log("🔥 NOVO BACKEND ATIVO");
  try {
    let { title, price, modules, creatorId } = req.body;

    console.log("BODY RECEBIDO:", JSON.stringify(req.body, null, 2));

    if (!Array.isArray(modules)) modules = [];

    const safeModules = modules.map((m) => {
      let lessons = m.lessons;

      if (typeof lessons === "string") {
        try {
          lessons = JSON.parse(lessons);
        } catch {
          console.log("Erro parse lessons");
          lessons = [];
        }
      }

      if (!Array.isArray(lessons)) lessons = [];

      return {
        title: m.title || "",
        lessons: lessons.map((l) => ({
          title: l.title || "",
          type: l.type || "video",
          content: l.content || "",
          cover: l.cover || ""
        }))
      };
    });

    const course = await Course.create({
      title,
      price: Number(price),
      modules: safeModules,
      creatorId
    });

    res.json(course);

  } catch (error) {
    console.log("ERRO AO CRIAR CURSO:", error);
    res.status(500).json({ error: "Erro ao criar curso" });
  }
});

// =========================
// CURSOS
// =========================
app.get("/courses/:id", async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ error: "Curso não encontrado" });
  res.json(course);
});

app.delete("/courses/:id", async (req, res) => {
  await Course.findByIdAndDelete(req.params.id);
  res.json({ message: "Curso deletado" });
});

// =========================
// AULAS
// =========================
app.get("/courses/:courseId/lessons", async (req, res) => {
  const lessons = await Lesson.find({ courseId: req.params.courseId }).sort({ order: 1 });
  res.json(lessons);
});

app.post("/lessons", async (req, res) => {
  const lesson = await Lesson.create(req.body);
  res.json(lesson);
});

// =========================
// LIVROS
// =========================
app.post("/books", async (req, res) => {
  const book = await Book.create(req.body);
  res.json(book);
});

app.get("/books", async (req, res) => {
  const books = await Book.find();
  res.json(books);
});

// =========================
// REGISTER / LOGIN
// =========================
app.post("/register", async (req, res) => {
  const { name, email, password, role } = req.body;

  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ error: "Usuário já existe" });

  const hashed = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    password: hashed,
    role
  });

  res.json({ userId: user._id });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: "Usuário não encontrado" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: "Senha inválida" });

  const token = jwt.sign({
    id: user._id,
    name: user.name,
    role: user.role
  }, JWT_SECRET, { expiresIn: "7d" });

  res.json({ token, userId: user._id, role: user.role });
});

// =========================
// PAGAMENTO
// =========================
app.post("/create-payment", async (req, res) => {
  const { title, price, userId, courseId } = req.body;

  const preference = new Preference(client);

  const response = await preference.create({
    body: {
      items: [{
        title,
        unit_price: Number(price),
        quantity: 1
      }],
      metadata: { userId, courseId },
      back_urls: {
        success: `${process.env.FRONTEND_URL}/payment-success`,
        failure: `${process.env.FRONTEND_URL}/payment-error`,
        pending: `${process.env.FRONTEND_URL}/payment-pending`
      },
      auto_return: "approved",
      notification_url: `${process.env.BASE_URL}/webhook/mercadopago`
    }
  });

  res.json({ id: response.id });
});

// =========================
// WEBHOOK
// =========================
app.post("/webhook/mercadopago", async (req, res) => {
  try {
    const body = req.body;

    if (body.type === "payment") {
      const paymentId = body.data.id;

      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
          }
        }
      );

      const payment = await response.json();

      if (payment.status === "approved") {
        const { userId, courseId } = payment.metadata;

        const exists = await Purchase.findOne({ paymentId });

        if (!exists) {
          await Purchase.create({ userId, courseId, paymentId });
        }
      }
    }

    res.sendStatus(200);

  } catch (error) {
    console.log("Erro webhook:", error);
    res.sendStatus(500);
  }
});

// =========================
// VERIFY PAYMENT
// =========================
app.get("/verify-payment/:paymentId", async (req, res) => {
  try {
    const paymentId = req.params.paymentId;

    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
        }
      }
    );

    const payment = await response.json();

    if (payment.status === "approved") {
      return res.json({ success: true });
    }

    res.json({ success: false });

  } catch (error) {
    res.status(500).json({ error: "Erro ao verificar pagamento" });
  }
});

// =========================
// MEUS CURSOS
// =========================
app.get("/my-courses/:userId", async (req, res) => {
  const purchases = await Purchase.find({ userId: req.params.userId });
  const courseIds = purchases.map(p => p.courseId);

  const courses = await Course.find({ _id: { $in: courseIds } });

  res.json(courses);
});

// =========================
// CERTIFICADO
// =========================
app.get("/certificate/:userId/:courseId", async (req, res) => {
  const user = await User.findById(req.params.userId);
  const course = await Course.findById(req.params.courseId);

  const doc = new PDFDocument({ size: "A5", layout: "landscape" });

  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);

  doc.fontSize(30).text("CERTIFICADO", { align: "center" });
  doc.moveDown();
  doc.text(user.name, { align: "center" });
  doc.moveDown();
  doc.text(course.title, { align: "center" });

  doc.end();
});

// =========================
// START
// =========================
app.listen(PORT, () => {
  console.log("🚀 API rodando na porta", PORT);
});