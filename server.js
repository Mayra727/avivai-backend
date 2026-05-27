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
import Progress from "./models/Progress.js";

import multer from "multer";

import nodemailer
from "nodemailer";

import WatchProgress from "./models/WatchProgress.js";

import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const transporter =
nodemailer.createTransport({

service:"Brevo",

host:"smtp-relay.brevo.com",

port:465,

secure:true,

auth:{

user:
process.env.SMTP_USER,

pass:
process.env.SMTP_PASS

}

});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log("🔥 CLOUD:", process.env.CLOUDINARY_CLOUD_NAME);
console.log("🔥 KEY:", process.env.CLOUDINARY_API_KEY);
console.log("🔥 SECRET:", process.env.CLOUDINARY_API_SECRET);

import fs from "fs";

const upload = multer({

  dest: "uploads/",

  limits: {
    fileSize: 200 * 1024 * 1024
  }

});

if (!fs.existsSync("uploads")) {

  fs.mkdirSync("uploads");

}

// =========================
// CONFIG
// =========================
const app = express();

app.use(cors({

  origin:[

    "https://avivaioficial.com.br",

    "https://www.avivaioficial.com.br",

    "https://avivai-frontend.vercel.app"

  ],

  credentials:true

}));

app.use(express.json({
  limit: "200mb"
}));

app.use(express.urlencoded({
  extended: true,
  limit: "200mb"
}));

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

  pdf: {
    type: String,
    default: ""
  },

  lessons: [LessonSchema]

});

const CourseSchema = new mongoose.Schema({
  title: String,

type: {
  type: String,
  default: "curso"
},

  price: {
    type: Number,
    default: 0
  },

promoPrice: {
  type: Number,
  default: 0
},

initialLessons: {
  type: Array,
  default: []
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

  const Purchase = mongoose.model(

"Purchase",

new mongoose.Schema({

  userId:String,

  courseId:String,

  createdAt:{
    type:Date,
    default:Date.now
  }

})

);


const User = mongoose.model("User", new mongoose.Schema({

  name: String,

  email: {
    type: String,
    unique: true
  },

  password: String,

  role: {
    type: String,
    enum: [
      "superadmin",
      "produtor",
      "aluno"
    ],
    default: "aluno"
  },

  // 🔥 recuperação senha

  resetToken: String,

  resetTokenExpires: Date

}));

const Access = mongoose.model(

  "Access",

  new mongoose.Schema({

    userId:String,

    courseId:String,

    status:{
      type:String,
      default:"pendente"
    }

  })

);

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

app.post(
  "/upload-video",
  upload.single("video"),
  async (req, res) => {

    try {

      const result = await cloudinary.uploader.upload_large(
        req.file.path,
        {
          resource_type: "video",
          folder: "courses/videos"
        }
      );

      res.json({
        url: result.secure_url
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        error: "Erro upload vídeo"
      });
    }
  }
);

// =========================
// UPLOAD PDF
// =========================

app.post(
  "/upload-pdf",
  upload.single("pdf"),
  async (req, res) => {

    try {

      console.log(req.file);

      const result =
        await cloudinary.uploader.upload_large(

          req.file.path,

          {
            resource_type: "raw",
            folder: "courses/pdfs"
          }

        );

      res.json({
        url: result.secure_url
      });

    } catch (error) {

      console.log("❌ PDF ERROR");

      console.log(error);

      console.log(error.message);

      res.status(500).json({
        error: error.message
      });

    }

  }
);

app.post(
  "/create-access",
  async (req, res) => {

    try {

      const {
        userId,
        courseId
      } = req.body;

      const exists =
        await Access.findOne({
          userId,
          courseId
        });

      if(exists){

        return res.json(exists);

      }

      const access =
        await Access.create({

          userId,

          courseId,

          status:"pendente"

        });

      res.json(access);

    } catch (error) {

      console.log(error);

      res.status(500).json({
        error:"Erro"
      });

    }

  }
);

// =========================
// LISTAR CURSOS
// =========================

app.get(
"/courses",

async(req,res)=>{

try{

const courses =
await Course.find();

res.json(courses);

}catch(error){

console.log(error);

res.status(500).json({
error:"Erro ao buscar cursos"
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

    let {
  title,
  price,
  promoPrice,
  initialLessons,
  modules,
  creatorId
} = req.body;


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

  pdf: m.pdf || "",

  lessons: safeLessons

};
});

    // 🔥 cria curso
    const course = await Course.create({

  title: title || "",

  price: Number(price) || 0,

  promoPrice:
    Number(promoPrice) || 0,

  initialLessons:
    initialLessons || [],

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

app.post(
"/grant-access",

async(req,res)=>{

try{

const {
userId,
courseId
}=req.body;

const exists =
await Access.findOne({
userId,
courseId
});

if(exists){

return res.json({
success:true
});

}

await Access.create({

userId,
courseId,

status:"liberado"

});

res.json({
success:true
});

}catch(error){

console.log(error);

res.status(500).json({
error:"Erro"
});

}

});

// =========================
// CREATE CHECKOUT
// =========================

app.post(

"/create-checkout",

async(req,res)=>{

try{

const {
courseId,
userId
}=req.body;

// 🔥 busca curso
const course =
await Course.findById(
courseId
);

if(!course){

return res.status(404).json({
error:"Curso não encontrado"
});

}

// 🔥 cria checkout InfinitePay
const response =
await fetch(

"https://api.checkout.infinitepay.io/links",

{

method:"POST",

headers:{

"Content-Type":
"application/json",

"Authorization":
"Bearer SUA_API_KEY"

},

body:JSON.stringify({

title: course.title,

description:
`Acesso ao curso ${course.title}`,

amount:
Math.round(
course.price * 100
),

quantity:1,

checkoutType:"redirect",

externalReference:
`${userId}-${courseId}`,

redirectUrl:
"https://avivaioficial.com.br/payment-success"

})

}

);

const data =
await response.json();

console.log(data);

res.json(data);

}catch(error){

console.log(error);

res.status(500).json({
error:"Erro checkout"
});

}

});

// =========================
// MEUS CURSOS
// =========================


app.get(
"/my-courses/:userId",

async(req,res)=>{

try{

const access =
await Access.find({

userId:
req.params.userId,

status:"liberado"

});

const courseIds =
access.map(
(a)=>a.courseId
);

const courses =
await Course.find({

_id:{
$in:courseIds
}

});

res.json(courses);

}catch(error){

console.log(error);

res.status(500).json({
error:"Erro"
});

}

});

// =========================
// SAVE VIDEO PROGRESS
// =========================

app.post(
"/watch-progress",

async(req,res)=>{

try{

const {
userId,
courseId,
lessonId,
videoTime
} = req.body;

const existing =
await WatchProgress.findOne({

userId,
courseId,
lessonId

});

if(existing){

existing.videoTime =
videoTime;

existing.updatedAt =
new Date();

await existing.save();

return res.json(existing);

}

const progress =
await WatchProgress.create({

userId,
courseId,
lessonId,
videoTime

});

res.json(progress);

}catch(error){

console.log(error);

res.status(500).json({
error:"Erro ao salvar progresso"
});

}

});


// =========================
// GET VIDEO PROGRESS
// =========================

app.get(
"/watch-progress/:userId/:courseId/:lessonId",

async(req,res)=>{

try{

const {
userId,
courseId,
lessonId
} = req.params;

const progress =
await WatchProgress.findOne({

userId,
courseId,
lessonId

});

res.json(progress || {
videoTime:0
});

}catch(error){

console.log(error);

res.status(500).json({
error:"Erro ao buscar progresso"
});

}

});

// =========================
// SALVAR PROGRESSO
// =========================

app.post(
  "/progress",
  async (req, res) => {

    try {

      const {
        userId,
        courseId,
        lessonId,
        completed
      } = req.body;

      const progress =
        await Progress.findOneAndUpdate(

          {
            userId,
            courseId,
            lessonId
          },

          {
            completed
          },

          {
            upsert: true,
            new: true
          }
        );

      res.json(progress);

    } catch (error) {

      console.log(error);

      res.status(500).json({
        error: "Erro ao salvar progresso"
      });
    }
  }
);

// =========================
// BUSCAR PROGRESSO
// =========================

app.get(
  "/progress/:userId/:courseId",

  async (req, res) => {

    try {

      const {
        userId,
        courseId
      } = req.params;

      const progress =
        await Progress.find({
          userId,
          courseId
        });

      res.json(progress);

    } catch (error) {

      console.log(error);

      res.status(500).json({
        error: "Erro ao buscar progresso"
      });
    }
  }
);

// =========================
// GET CURSO
// =========================
app.get("/courses/:id", async (req, res) => {
  const course = await Course.findById(req.params.id);
  res.json(course);
});

// =========================
// GET USERS
// =========================

app.get("/users", async (req, res) => {

  try {

    const users = await User.find().select(
  "name email role"
);

    res.json(users);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      error: "Erro ao buscar usuários"
    });

  }

});

// =========================
// RELEASE ACCESS
// =========================

app.put(
  "/release-access/:id",
  async (req, res) => {

    try {

      await Access.findByIdAndUpdate(

        req.params.id,

        {
          status:"liberado"
        }

      );

      res.json({
        success:true
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        error:"Erro liberar"
      });

    }

  }
);

// =========================
// ACCESS LIST
// =========================

app.get(
  "/access-list",
  async (req, res) => {

    try {

      const access =
        await Access.find();

      res.json(access);

    } catch (error) {

      console.log(error);

      res.status(500).json({
        error:"Erro"
      });

    }

  }
);

// =========================
// REGISTER
// =========================
app.post("/register", async (req, res) => {

  try {

    let {
      name,
      email,
      password
    } = req.body;

console.log(
      "BODY REGISTER:",
      req.body
    );

    email =
      email.trim().toLowerCase();

    const exists =
      await User.findOne({
        email
      });

    if (exists) {

      return res.status(400).json({
        error: "Já existe"
      });

    }

    const hashed =
      await bcrypt.hash(
        password,
        10
      );

    const user =
      await User.create({

        name,

        email,

        password: hashed

      });

    console.log(
      "USER SALVO:",
      user
    );

    res.json(user);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      error:
        "Erro ao cadastrar"
    });

  }
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
// FORGOT PASSWORD
// =========================

app.post(
"/forgot-password",

async(req,res)=>{

try{

const { email } =
req.body;

const user =
await User.findOne({

email:
email.trim().toLowerCase()

});

if(!user){

return res.status(404).json({
error:"Usuário não encontrado"
});

}

// 🔥 gera token simples

const resetToken =
Math.random()
.toString(36)
.substring(2);

user.resetToken =
resetToken;

user.resetTokenExpires =
Date.now() +
1000 * 60 * 30;

// 30 minutos

await user.save();

const resetLink =

`https://avivaioficial.com.br/reset-password/${resetToken}`;

await fetch(

"https://api.brevo.com/v3/smtp/email",

{

method:"POST",

headers:{

"accept":"application/json",

"api-key":
process.env.BREVO_API_KEY,

"content-type":
"application/json"

},

body:JSON.stringify({

sender:{

name:"Avivai",

email:"mayracarol727@gmail.com"

},

to:[

{
email:user.email
}

],

subject:
"Recuperação de senha",

htmlContent:`

<div
style="
font-family:Arial;
padding:20px;
"
>

<h2>
Recuperação de senha
</h2>

<p>
Clique abaixo para
criar uma nova senha:
</p>

<a

href="${resetLink}"

style="
display:inline-block;
padding:12px 20px;
background:#7A4A3A;
color:white;
text-decoration:none;
border-radius:8px;
margin-top:20px;
"

>

Redefinir senha

</a>

</div>

`

})

}

);

console.log(
"📧 EMAIL ENVIADO"
);

res.json({
success:true
});

}catch(error){

console.log(error);

res.status(500).json({
error:"Erro servidor"
});

}

});

// =========================
// RESET PASSWORD
// =========================

app.post(
"/reset-password",

async(req,res)=>{

try{

const {
token,
password
} = req.body;

const user =
await User.findOne({

resetToken: token,

resetTokenExpires:{
$gt: Date.now()
}

});

if(!user){

return res.status(400).json({
error:"Token inválido ou expirado"
});

}

const hashed =
await bcrypt.hash(
password,
10
);

user.password =
hashed;

// 🔥 limpa token

user.resetToken =
undefined;

user.resetTokenExpires =
undefined;

await user.save();

res.json({
success:true
});

}catch(error){

console.log(error);

res.status(500).json({
error:"Erro servidor"
});

}

});

// =========================
// CHECK ACCESS
// =========================

app.get(
"/check-access/:userId/:courseId",

async(req,res)=>{

try{

const {
userId,
courseId
}=req.params;

// 🔥 curso existe?
const course =
await Course.findById(
courseId
);

if(!course){

return res.json({
hasAccess:false
});

}

// 🔥 produtor dono
if(
course.creatorId === userId
){

return res.json({
hasAccess:true
});

}

// 🔥 compra
const purchase =
await Purchase.findOne({

  userId,
  courseId

});

if(purchase){

  return res.json({
    hasAccess:true
  });

}

// 🔥 acesso manual liberado
const access =
await Access.findOne({

  userId,
  courseId,
  status:"liberado"

});

if(access){

  return res.json({
    hasAccess:true
  });

}

// 🔥 bloqueado
return res.json({
hasAccess:false
});

}catch(error){

console.log(error);

res.status(500).json({
hasAccess:false
});

}

});

// =========================
// UPDATE COURSE
// =========================

app.put("/courses/:id", async (req, res) => {

  try {

    const {
  title,
  price,
  promoPrice,
  modules
} = req.body;

    const updatedCourse =
      await Course.findByIdAndUpdate(

        req.params.id,

        {
          title,
          price,
          promoPrice,
          modules
        },

        {
          new: true
        }

      );

    res.json(updatedCourse);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      error: "Erro ao atualizar curso"
    });

  }

});

// =========================
// DELETE
// =========================

app.delete("/courses/:id", async (req, res) => {

  try {

    await Course.findByIdAndDelete(
      req.params.id
    );

    res.json({
      success: true
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      error: "Erro ao excluir curso"
    });
  }
});

// =========================
// START
// =========================
app.listen(PORT, () => {
  console.log("🚀 Rodando na porta", PORT);
});