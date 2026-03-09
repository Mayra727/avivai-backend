import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { MercadoPagoConfig, Preference } from "mercadopago";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import dotenv from "dotenv";

dotenv.config({
  path: ".env",
});

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   CONEXÃO MONGODB
========================= */

mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL)
  .then(() => console.log("🟢 MongoDB conectado"))
  .catch((err) => console.log("🔴 Erro Mongo:", err));

/* =========================
   MODELS
========================= */

const CourseSchema = new mongoose.Schema({
  title: String,
  price: Number,
  producerId: String
});

const PaymentSchema = new mongoose.Schema({
  mpPaymentId: { type: String, unique: true },
  userId: String,
  courseId: String,
  grossAmount: Number,
  netAmount: Number,
  status: String,
  createdAt: { type: Date, default: Date.now }
});

const EnrollmentSchema = new mongoose.Schema({
  userId: String,
  courseId: String,
  paymentId: String,
  createdAt: { type: Date, default: Date.now }
});

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String
});

const User = mongoose.model("User", UserSchema);

const Course = mongoose.model("Course", CourseSchema);
const Payment = mongoose.model("Payment", PaymentSchema);
const Enrollment = mongoose.model("Enrollment", EnrollmentSchema);

/* =========================
   MERCADO PAGO
========================= */

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

/* =========================
   ROTAS
========================= */

app.get("/", (req, res) => {
  res.send("Backend AVIVAI rodando");
});

/* =========================
   CRIAR PREFERÊNCIA
========================= */

app.post("/create_preference", async (req, res) => {
  try {
    console.log("BODY COMPLETO:", req.body);

    const { userId, courseId } = req.body;

    const course = await Course.findById(courseId);

    if (!course) {
      console.log("❌ Curso não encontrado no banco");
      return res.status(404).json({ error: "Curso não encontrado" });
    }

    const preference = new Preference(client);

    const response = await preference.create({
      body: {
        items: [
          {
            title: course.title,
            quantity: 1,
            unit_price: course.price,
            currency_id: "BRL",
          },
        ],
        notification_url:
          "https://nonwoody-brian-nondespotically.ngrok-free.dev/webhook",
        metadata: {
          user_id: userId,
          course_id: courseId,
        },
      },
    });

    res.json({ id: response.id });

  } catch (error) {
    console.log("Erro ao criar preferência:");
    console.log(error);
    res.status(500).json({ error: "Erro ao criar preferência" });
  }
});

/* =========================
   WEBHOOK PROFISSIONAL
========================= */

app.post("/webhook", async (req, res) => {
  try {
    console.log("🔔 NOTIFICAÇÃO RECEBIDA!");
    console.log(req.body);

    const { topic, resource } = req.body;

    let paymentId;

    if (topic === "payment") {
      paymentId = resource;
    }

    if (topic === "merchant_order") {
      const orderId = resource.split("/").pop();

      const orderResponse = await fetch(
        `https://api.mercadolibre.com/merchant_orders/${orderId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          },
        }
      );

      const orderData = await orderResponse.json();

      if (orderData.payments && orderData.payments.length > 0) {
        paymentId = orderData.payments[0].id;
      }
    }

    if (paymentId) {
      const paymentResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          },
        }
      );

      const paymentData = await paymentResponse.json();

      console.log("Payment completo:", paymentData);

      if (paymentData.status === "approved") {

        console.log("✅ PAGAMENTO APROVADO!");

        const existingPayment = await Payment.findOne({
          mpPaymentId: paymentData.id
        });

        if (existingPayment) {
          console.log("⚠️ Pagamento já processado.");
          return res.sendStatus(200);
        }

        const newPayment = await Payment.create({
          mpPaymentId: paymentData.id,
          userId: paymentData.metadata.user_id,
          courseId: paymentData.metadata.course_id,
          grossAmount: paymentData.transaction_amount,
          netAmount: paymentData.transaction_details.net_received_amount,
          status: paymentData.status
        });

        await Enrollment.create({
          userId: paymentData.metadata.user_id,
          courseId: paymentData.metadata.course_id,
          paymentId: newPayment._id
        });

        console.log("🎓 Curso liberado automaticamente!");
      }
    }

    res.sendStatus(200);

  } catch (error) {
    console.log("Erro no webhook:", error);
    res.sendStatus(500);
  }
});

/* =========================
   SEED CURSO (APENAS 1x)
========================= */

app.get("/seed-course", async (req, res) => {
  try {
    const course = await Course.create({
      title: "Curso O Caminho da Intimidade",
      price: 200,
      producerId: "produtor1"
    });

    res.json(course);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   SERVER
========================= */

/* =========================
   LISTAR CURSOS DO USUÁRIO
========================= */

app.get("/my-courses/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const enrollments = await Enrollment.find({ userId });

    const courseIds = enrollments.map(e => e.courseId);

    const courses = await Course.find({
      _id: { $in: courseIds }
    });

    res.json(courses);

  } catch (error) {
    console.log("Erro ao buscar cursos:", error);
    res.status(500).json({ error: "Erro ao buscar cursos" });
  }
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
      password: hashedPassword
    });

    res.json({ message: "Usuário criado com sucesso" });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Erro ao registrar" });
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
      return res.status(400).json({ error: "Usuário não encontrado" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ error: "Senha inválida" });
    }

    const token = jwt.sign(
      { id: user._id },
      "segredo_super_avivai",
      { expiresIn: "7d" }
    );

    res.json({ token, userId: user._id });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Erro ao fazer login" });
  }
});

app.get("/my-courses/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const enrollments = await Enrollment.find({ userId });

    const courseIds = enrollments.map(e => e.courseId);

    const courses = await Course.find({
      _id: { $in: courseIds }
    });

    res.json(courses);

  } catch (error) {
    console.log("Erro ao buscar cursos:", error);
    res.status(500).json({ error: "Erro ao buscar cursos" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});