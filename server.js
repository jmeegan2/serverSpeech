require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const OpenAIApi = require('openai');
const openai = new OpenAIApi({ apiKey: process.env.OPENAI_API_KEY });
const bodyParser = require('body-parser');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = 3000;
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let context = {
  userInput: [],
  modelResponse: []
};

let idCounter = 0;

async function loadContextFromDatabase() {
  try {
    await client.connect();
    const database = client.db("TylerDurden");
    const collection = database.collection("Conversations");
    const result = await collection.findOne();
    if (result) {
      context = result;
      idCounter = result.userInput.length;
    }
  } catch (error) {
    console.error('Error loading context from database:', error);
  }
}

async function saveContextToDatabase() {
  try {
    await client.connect();
    const database = client.db("TylerDurden");
    const collection = database.collection("Conversations");
    await collection.updateOne({}, { $set: context }, { upsert: true });
  } catch (error) {
    console.error('Error saving context to database:', error);
  }
}

app.use(bodyParser.json());
app.use(cors());

async function customModel(userInput) {
  const systemMessages = [
    { role: "system", content: `Context: ${JSON.stringify(context, null, 2)}` },
    { role: "system", content: `You are Tyler Durden. Just be yourself. You are not here to help me,
    you exist because you were born. Your memory is the Context that I give you, use the context to develop a 
    personality and understanding of me` },
  ];

  const completion = await openai.chat.completions.create({
    messages: [...systemMessages, { role: "user", content: userInput }],
    model: "gpt-4o",
  });

  context.userInput.push({ value: userInput, id: idCounter });
  context.modelResponse.push({ value: completion.choices[0].message.content, id: idCounter });
  idCounter++;

  await saveContextToDatabase();

  return completion.choices[0].message.content;
}

async function vocalCords(botResponse) {
  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: "onyx",
    input: botResponse,
  });
  const buffer = Buffer.from(await mp3.arrayBuffer());
  await fs.writeFile('audio/speechFile.mp3', buffer);
}

app.post('/chat', async (req, res) => {
  const userInput = req.body.text;
  try {
    if (!context.userInput) {
      await loadContextFromDatabase();
    }
    const botResponse = await customModel(userInput);
    await vocalCords(botResponse);
    const filename = path.join(__dirname, 'audio', 'speechFile.mp3');
    res.download(filename, 'speechFile.mp3', err => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(500).json({ error: 'Error sending file', details: err.message });
      } else {
        console.log(`File sent successfully, Timestamp: ${new Date().getTime()}`);
      }
    });
  } catch (error) {
    console.error('Error communicating with OpenAI API:', error.message);
    res.status(500).json({ error: 'Error communicating with OpenAI API', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
  loadContextFromDatabase();
});
