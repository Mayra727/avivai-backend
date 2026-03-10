import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { MercadoPagoConfig, Preference } from "mercadopago";

dotenv.config();

console.log("MP TOKEN:", process.env.MP_ACCESS_TOKEN);

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   VARIÁVEIS
========================= */

const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "avivai_secret";

/* =========================
   CONEXÃO MONGODB
========================= */

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("🟢 MongoDB conectado");
  })
  .catch((err) => {
    console.error("Erro ao conectar MongoDB:", err);
  });

/* =========================
   MODELO USER
========================= */

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: {
    type: String,
    enum: ["superadmin", "produtor", "aluno"],
    default: "aluno"
  }
})

const User = mongoose.model("User", UserSchema);

/* =========================
   MODELO COURSE
========================= */

const CourseSchema = new mongoose.Schema({
  title: String,
  description: String,
  price: Number,
  creatorId: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Course = mongoose.model("Course", CourseSchema);

/* =========================
   MODELO LESSON
========================= */

const LessonSchema = new mongoose.Schema({
  courseId: String,
  title: String,
  videoUrl: String,
  order: Number
});

const Lesson = mongoose.model("Lesson", LessonSchema);

/* =========================
   MODELO PURCHASE
========================= */

const PurchaseSchema = new mongoose.Schema({

  userId: String,
  courseId: String,
  paymentId: String,

  createdAt: {
    type: Date,
    default: Date.now
  }

});

const Purchase = mongoose.model("Purchase", PurchaseSchema);

/* =========================
   WEBHOOK MERCADO PAGO
========================= */

app.post("/webhook/mercadopago", async (req, res) => {

  try {

    const payment = req.body;

    console.log("Webhook recebido:", payment);

    if (payment.type === "payment") {

      const paymentId = payment.data.id;

      console.log("Pagamento aprovado:", paymentId);

      // Aqui depois vamos buscar os dados do pagamento

    }

    res.sendStatus(200);

  } catch (error) {

    console.log(error);

    res.sendStatus(500);

  }

});

/* =========================
   CRIAR AULA
========================= */

app.post("/lessons", async (req, res) => {

  try {

    const { courseId, title, videoUrl, order } = req.body;

    const lesson = await Lesson.create({
      courseId,
      title,
      videoUrl,
      order
    });

    res.json(lesson);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      error: "Erro ao criar aula"
    });

  }

});

/* =========================
   LISTAR AULAS DO CURSO
========================= */

app.get("/courses/:courseId/lessons", async (req, res) => {

  try {

    const lessons = await Lesson.find({
      courseId: req.params.courseId
    }).sort({ order: 1 });

    res.json(lessons);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      error: "Erro ao buscar aulas"
    });

  }

});

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
   CRIAR CURSO
========================= */

app.post("/courses", async (req, res) => {

  try {

    const { title, description, price, creatorId } = req.body;

    const course = await Course.create({
      title,
      description,
      price,
      creatorId
    });

    res.json(course);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      error: "Erro ao criar curso"
    });

  }

});

/* =========================
   LISTAR CURSOS
========================= */

app.get("/courses", async (req, res) => {

  try {

    const courses = await Course.find();

    res.json(courses);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      error: "Erro ao buscar cursos"
    });

  }

});

/* =========================
   REGISTRO
========================= */

app.post("/register", async (req, res) => {

  try {

    const { name, email, password, role } = req.body;

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
      password: hashedPassword,
      role: role || "aluno"
    });

    res.json({
      message: "Usuário criado",
      userId: user._id
    });

  } catch (error) {

    console.error("ERRO REGISTER:", error);

    res.status(500).json({
      error: error.message
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
  userId: user._id,
  role: user.role
});

  } catch (error) {

    console.log(error);

    res.status(500).json({
      error: "Erro no login"
    });

  }

});

/* =========================
   PAGAMENTO MERCADO PAGO
========================= */

app.post("/create-payment", async (req, res) => {

  try {

    const { title, price } = req.body;

    const preference = new Preference(client);

    const response = await preference.create({
      body: {
        items: [
          {
            title: title,
            unit_price: Number(price),
            quantity: 1
          }
        ]
      }
    });

    res.json({
      id: response.id
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      error: "Erro ao criar pagamento"
    });

  }

});

/* =========================
   START SERVER
========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});