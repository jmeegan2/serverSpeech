const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const OpenAIApi = require('openai');
require('dotenv').config();
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

let conversationContext = {
  userInput: [],
  modelResponse: []
};
let idCounter = 0;

app.use(bodyParser.json());
app.use(cors());


/*
  Routes
*/

app.post('/chat', async (req, res) => {
  const userInput = req.body.text;
  try {
    if (!conversationContext.userInput) {
      await loadConversationContextFromDatabase();
    }
    const botResponse = await processUserInput(userInput);
    await generateAudio(botResponse);
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


/*
  Main functions
*/

async function processUserInput(userInput) {
  let limitedConversation = await summarizeForCostSaving();
  if (limitedConversation) {
    conversationContext = limitedConversation;
  }

  const systemMessages = [
    { role: "system", content: `Context: ${JSON.stringify(conversationContext)}` },
    { role: "system", content: `You are Tyler Durden. Just be yourself. You are not here to help me, 
    you exist because you were born. Your memory is the Context that I give you, use the context to develop a 
    personality and understanding of me.` },
  ];

  const completion = await openai.chat.completions.create({
    messages: [...systemMessages, { role: "user", content: userInput }],
    model: "gpt-4o",
  }); 

  conversationContext.userInput.push({ value: userInput, id: idCounter });
  conversationContext.modelResponse.push({ value: completion.choices[0].message.content, id: idCounter });
  idCounter++;

  await saveConversationContextToDatabase(limitedConversation);
  return completion.choices[0].message.content;
}

async function summarizeForCostSaving() {
  const amountOfTokens = countTokens(JSON.stringify(conversationContext));

  if (amountOfTokens > 2500) {
    const limitConversationMessages = [
      { role: "system", content: `Context: ${JSON.stringify(conversationContext)}` },
      { role: "system", content: `Summarize this conversation, including the main points and essence. 
      Keep the same structure with "userInput" and "modelResponse", and make it shorter, using less than 500 tokens.
      Structure I want:
      {
        "userInput": [],
        "modelResponse": []
      }
      Return the summary as a valid JSON object.`},
    ];

    const conversationSmaller = await openai.chat.completions.create({
      messages: limitConversationMessages,
      model: "gpt-4o",
    });

    const summaryContent = conversationSmaller.choices[0].message.content;

    try {
      const jsonString = summaryContent.slice(
        summaryContent.indexOf('{'),
        summaryContent.lastIndexOf('}') + 1
      );
      const summarizedContext = JSON.parse(jsonString);
      if (summarizedContext.userInput && summarizedContext.modelResponse) {
        return summarizedContext;
      }
    } catch (error) {
      console.error('Error parsing summarized context:', error);
    }

  }

  return null; // Return null if no summarization is needed or if parsing fails
}


/*
  Helper functions
*/

function countTokens(jsonString) {
  const tokens = jsonString.match(/\w+|[{}[\]:,]/g);
  console.log(`Tokens: ${tokens.length}`);
  return tokens ? tokens.length : 0
}

async function generateAudio(botResponse) {
  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: "onyx",
    input: botResponse,
  });
  const buffer = Buffer.from(await mp3.arrayBuffer());
  await fs.writeFile(path.join(__dirname, 'audio', 'speechFile.mp3'), buffer);
}


/*
  MongoDB data 
*/

async function loadConversationContextFromDatabase() {
  try {
    await client.connect();
    const database = client.db("TylerDurden");
    const collection = database.collection("Conversations");

    const result = await collection.findOne({}, { sort: { timestamp: -1 } });
    if (result) {
      conversationContext = result;
      idCounter = result.userInput.length;
        }
  } catch (error) {
    console.error('Error loading context from database:', error);
  } finally {
    await client.close();
  }
}

async function saveConversationContextToDatabase(limitedConversation) {
  try {
    await client.connect();
    const database = client.db("TylerDurden");
    const collection = database.collection("Conversations");

    const contextWithTimestamp = {
      ...conversationContext,
      timestamp: new Date(),
    };

    if (limitedConversation) {
      // Insert a new record instead of updating the old one
      await collection.insertOne(contextWithTimestamp);
    } else {
      await collection.updateOne({}, { $set: contextWithTimestamp }, { upsert: true });
    }
  } catch (error) {
    console.error('Error saving context to database:', error);
  }
}



app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
  loadConversationContextFromDatabase();
});