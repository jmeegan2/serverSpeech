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
let summarizeNextCall = false;
let limitedConversation = null;
const warningMessageForTokenLimit = "Heads up: Token limit hit. Next response might drag 'cause we need to cut costs.";
app.use(bodyParser.json());
app.use(cors());


/*
  Routes
*/

app.post('/chat', async (req, res) => {
  const userInput = req.body.text;
  try {
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
  
  await checkAndHandleSummarization()

  const systemMessages = [
    { role: "system", content: `Context: ${JSON.stringify(conversationContext)}` },
    { role: "system", content: process.env.PERSONALITY_PROFILE },
  ];

  const completion = await openai.chat.completions.create({
    messages: [...systemMessages, { role: "user", content: userInput }],
    model: "gpt-4o",
  }); 

  conversationContext.userInput.push({ value: userInput, id: idCounter });
  conversationContext.modelResponse.push({ value: completion.choices[0].message.content, id: idCounter });
  idCounter++;

  await saveConversationContextToDatabase(); 
  return completion.choices[0].message.content;
}

async function summarizeForCostSaving() {
    const limitConversationMessages = [
      { role: "system", content: `Context: ${JSON.stringify(conversationContext)}` },
      { role: "system", content: process.env.SUMMARIZE_CONVERSATION_INSTRUCTIONS},
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
  if(summarizeNextCall) {
    botResponse = `${botResponse}, ${warningMessageForTokenLimit}`
  }
  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: "onyx",
    input: botResponse,
  });
  const buffer = Buffer.from(await mp3.arrayBuffer());
  await fs.writeFile(path.join(__dirname, 'audio', 'speechFile.mp3'), buffer);
}

async function checkAndHandleSummarization() {
  if (summarizeNextCall) {
    limitedConversation = await summarizeForCostSaving();
    if (limitedConversation) {
      conversationContext = limitedConversation;
    }
    summarizeNextCall = false;
    return 
  }
  const currentTokenCount = countTokens(JSON.stringify(conversationContext));
  if (currentTokenCount > process.env.TOKEN_LIMIT) {
    summarizeNextCall = true;
    return
  }
}

/*
  MongoDB data 
*/

async function loadConversationContextFromDatabase() {
  try {
    await client.connect();
    const database = client.db(process.env.DATABASE_NAME);
    const collection = database.collection(process.env.COLLECTION_NAME);

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

async function saveConversationContextToDatabase() {
  try {
    if(conversationContext === null || undefined) throw new Error('conversationContext is null or undefined');

    await client.connect();
    const database = client.db(process.env.DATABASE_NAME);
    const collection = database.collection(process.env.COLLECTION_NAME);

    const contextWithTimestamp = {
      ...conversationContext,
      timestamp: new Date(),
    };

    if (limitedConversation) {
      // Insert a new record instead of updating the old one
      await collection.insertOne(contextWithTimestamp);
      limitedConversation = null;
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