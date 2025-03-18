const mongoose = require("mongoose");
const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const path = require("path");
const os = require("os");
const session = require("express-session");

dotenv.config();

const app = express();
const cors = require("cors");
app.use(cors());
const port = process.env.PORT || 3000;
const url = process.env.DB_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("❌ Erreur : La clé API Gemini est manquante dans .env !");
  process.exit(1);
}

if (!globalThis.fetch) {
  const fetch = require("node-fetch");
  globalThis.fetch = fetch;
}

const IA_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
};

const getWifiIP = () => {
  const interfaces = os.networkInterfaces();
  return (
    (interfaces["Wi-Fi"] &&
      interfaces["Wi-Fi"].find((i) => i.family === "IPv4")?.address) ||
    "localhost"
  );
};

app.use(
  session({
    secret: "votre_secret_key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

(async () => {
  try {
    await mongoose.connect(url, options);
    console.log("✅ Connecté à MongoDB avec succès");
    const iplocal = getWifiIP();
    app.listen(port, "0.0.0.0", () => {
      console.log(`🚀 Serveur disponible sur http://${iplocal}:${port}`);
    });
  } catch (error) {
    console.error("❌ Erreur de connexion à MongoDB :", error);
  }
})();

const userSchema = new mongoose.Schema(
  {
    pseudo: { type: String, required: true },
    usermail: {
      type: String,
      required: true,
      validate: {
        validator: (v) => v && v.includes("@") && v.includes("."),
        message: (props) => `${props.value} n'est pas un email valide !`,
      },
    },
    userpassword: { type: String, required: true },
    preferences: { type: Object, default: {} },
    historique_voyages: { type: Array, default: [] },
  },
  { collection: "users" }
);
const User = mongoose.model("User", userSchema);

const destinationSchema = new mongoose.Schema(
  {
    nom: { type: String, required: true },
    pays: { type: String, required: true },
    description: { type: String, required: true },
    meteo: { type: Object, default: {} },
    attractions: { type: [String], default: [] },
    budget_estime: { type: Number, required: true },
  },
  { collection: "destinations" }
);
const Destination = mongoose.model("Destination", destinationSchema);

app.post("/adddestination", async (req, res) => {
  try {
    const { nom, pays, description, attractions, budget_estime } = req.body;

    if (!nom || !pays || !description || !budget_estime) {
      return res.status(400).json({ message: "Tous les champs sont requis." });
    }

    const prompt = `Je cherche une destination de voyage avec les informations suivantes soit vraiment court en donnant des information pertinent et bien sur des info sur comment trouver un logement et les hotels :
      Nom: ${nom}
      Pays: ${pays}
      Description: ${description}
      Budget: ${budget_estime} euros.
      Quels conseils de voyage me donneriez-vous ?`;

    const response = await fetch(IA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    const data = await response.json();
    console.log("Réponse de Gemini:", data);

    const recommandation =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Pas de recommandation disponible.";

    const newDestination = new Destination({
      nom,
      pays,
      description,
      attractions,
      budget_estime,
    });

    await newDestination.save();

    res.status(201).json({
      message: "Destination ajoutée avec succès",
      destination: newDestination,
      recommandation,
    });
  } catch (error) {
    console.error("Erreur lors de l'ajout de la destination :", error);
    res.status(500).send("Erreur lors de l'ajout de la destination");
  }
});

app.post("/get-recommendations", async (req, res) => {
  try {
    const { nom, pays, description, budget } = req.body;

    if (!nom || !pays || !description || !budget) {
      return res.status(400).json({ message: "Tous les champs sont requis." });
    }

    const prompt = `Je cherche une destination de voyage avec ces détails soit vraiment court en donnant des information pertinent et bien sur des info sur comment trouver un logement et les hotels :
      Nom: ${nom}, Pays: ${pays}, Description: ${description}, Budget: ${budget} euros.
      Que recommandez-vous ?`;

    const response = await fetch(IA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    const data = await response.json();
    console.log("Réponse de Gemini:", data);

    const recommandation =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Aucune recommandation disponible.";

    res.status(200).json({ recommandation });
  } catch (error) {
    console.error("Erreur Gemini :", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des recommandations." });
  }
});

app.get("/destinations", async (req, res) => {
  try {
    const destinations = await Destination.find();
    res.status(200).json(destinations);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors de la récupération des destinations");
  }
});

app.get("/destination/:id", async (req, res) => {
  try {
    const destination = await Destination.findById(req.params.id);
    if (!destination) {
      return res.status(404).json({ message: "Destination non trouvée" });
    }
    res.status(200).json(destination);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors de la récupération de la destination");
  }
});

module.exports = app;
