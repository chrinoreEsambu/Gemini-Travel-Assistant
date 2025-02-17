const mongoose = require("mongoose");
const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const path = require("path");
const os = require("os");
const session = require("express-session");
const fetch = require("node-fetch");
const GEMINI_API_KEY = process.env.from the (.envfile);
const IA_URL = `find it on the gemini api web site`;

dotenv.config();

const app = express();
const cors = require("cors");
app.use(cors());
const port = process.env.PORT || 3000;
const url = process.env.DB_URI;

const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
};

// Fonction pour obtenir l'IP locale
const getWifiIP = () => {
  const interfaces = os.networkInterfaces();
  return (
    (interfaces["Wi-Fi"] &&
      interfaces["Wi-Fi"].find((i) => i.family === "IPv4")?.address) ||
    "localhost"
  );
};

// Configuration des sessions
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
    console.log("❌ Erreur de connexion à MongoDB", error);
  }
})();

// Schéma utilisateur
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

// Schéma destination
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

// ✅ ENDPOINT : Ajouter une destination et obtenir une recommandation IA avec Gemini
app.post("/adddestination", async (req, res) => {
  try {
    const { nom, pays, description, attractions, budget_estime } = req.body;
    const prompt = `Je cherche une destination de voyage avec les informations suivantes donne des information est precise max 100 ligne tu dois toujours proposer des entreprise qui fournise des services ainsi que le lien des site web et aussi des site pour commander et donne aussi les lien des plateforme de service:\nNom: ${nom}\nPays: ${pays}\nDescription: ${description}\nBudget: ${budget_estime} euros.\nQuels conseils de voyage me donneriez-vous ?`;

    const response = await fetch(IA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    const data = await response.json();
    console.log("Réponse de Gemini:", data); // Log de la réponse complète pour déboguer

    // Debugging de la structure de 'content'
    if (data?.candidates?.[0]?.content) {
      console.log("Contenu de la réponse:", data.candidates[0].content);
    }

    // Modifié pour inspecter et extraire les données
    const recommandation =
      data?.candidates?.[0]?.content?.text ||
      "Pas de recommandation disponible"; // Accès à la réponse correcte

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
    console.error(error);
    res.status(500).send("Erreur lors de l'ajout de la destination");
  }
});

// ✅ ENDPOINT : Obtenir une recommandation IA depuis Gemini
app.post("/get-recommendations", async (req, res) => {
  try {
    const { nom, pays, description, budget } = req.body;

    if (!nom || !pays || !description || !budget) {
      return res.status(400).json({ message: "Tous les champs sont requis." });
    }

    const prompt = `Je cherche une destination de voyage avec les détails suivants et donne des detaille court et precise :
    Nom: ${nom}, 
    Pays: ${pays}, 
    Description: ${description}, 
    Budget: ${budget} euros.
    Que recommandez-vous à un voyageur ?`;

    const response = await fetch(IA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    const data = await response.json();
    console.log("Réponse de Gemini:", data); // Log de la réponse complète pour déboguer

    // Debugging de la structure de 'content'
    if (data?.candidates?.[0]?.content) {
      console.log("Contenu de la réponse:", data.candidates[0].content);
    }

    // Modifié pour inspecter et extraire les données
    const recommandation =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Aucune recommandation disponible Mr/M."; // Accès à la réponse correcte

    res.status(200).json({ recommandation });
  } catch (error) {
    console.error("Erreur Gemini :", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des recommandations." });
  }
});

// ✅ ENDPOINTS : Récupérer les destinations
app.get("/destinations", async (req, res) => {
  try {
    const destinations = await Destination.find();
    res.status(200).json(destinations);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors de la récupération des destinations");
  }
});

// ✅ ENDPOINT : Obtenir une destination par ID
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

// ✅ ENDPOINT : Rechercher une destination
app.get("/search", async (req, res) => {
  try {
    const query = req.query.query;
    const results = await Destination.find({
      $or: [
        { nom: { $regex: query, $options: "i" } },
        { pays: { $regex: query, $options: "i" } },
      ],
    });
    res.status(200).json(results);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors de la recherche de destination");
  }
});

module.exports = app;
