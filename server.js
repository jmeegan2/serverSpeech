require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const OpenAIApi = require('openai');
const openai = new OpenAIApi({ apiKey: process.env.OPENAI_API_KEY });
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const port = 3000;
let mongoDbContext = {
  userInput: [],
  modelResponse: []
};

let context = {
  userInput: [],
  modelResponse: []
};

let contextLoaded = false;
let idCounter = 0;

// Middleware initialization moved here to avoid redundant use() calls
app.use(bodyParser.json());
app.use(cors());

async function assistantModel(userInput) {
  try {
    const thread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userInput
    });
    let run = await openai.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: 'asst_yQfJncVuJQg3PL40dO7Awyxu',

    });

    if (run.status === 'completed') {
      const messages = await openai.beta.threads.messages.list(run.thread_id);
      return messages.data[0].content[0].text.value;
    } else {
      console.log(run.status);
    }
  } catch (error) {
    console.error('Error in theMind function:', error.message);
    throw error;
  }
}

async function loadContextFromFile() {
  try {

    let mongoContextPractice  = mongoDbContext ? JSON.stringify(mongoDbContext, null, 2) : { userInput: [], modelResponse: [] };
    context = mongoDbContext[0];
    console.log(`mongoContextPractice: ${context}`);
    // console.log(mongoDbContext[0].userInput?.length);
    idCounter = mongoDbContext[0].userInput?.length;
    contextLoaded = true;
    console.log('Context loaded from file.');
  } catch (error) {
    console.log('Error thrown in loadContextFromFile:', error);
    throw error
  }
}

async function saveContextToFile() {
  try {
    // await fs.writeFile(path.join(__dirname, 'context.json'), JSON.stringify(context, null, 2));
    await saveContextToDatabase();
    console.log('Context saved to file.');
  } catch (error) {
    console.error('Error saving context to file:', error);
  }
}

async function customMemoryModel(userInput) {
  if (!contextLoaded) await loadContextFromFile();

  let contextString =(JSON.stringify(context, null, 2));
  console.log(contextString);
  const systemMessages = [
    { role: "system", content: `Context: ${contextString}` },
    { role: "system", content: "You are Tyler Durden. Just be yourself. You are not here to help me, you exist because you were born." },
  ];

  const completion = await openai.chat.completions.create({
    messages: [...systemMessages, { role: "user", content: userInput }],
    model: "gpt-4o",
  });

  context.userInput.push({ value: userInput, id: idCounter });
  context.modelResponse.push({ value: completion.choices[0].message.content, id: idCounter });
  idCounter++;

  saveContextToFile().catch(console.error);

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
  console.log('File written successfully');
}

app.post('/chat', async (req, res) => {
  const userInput = req.body.text;
  console.log(`User input: ${userInput}`);
  const startTime = Date.now();  // Start the timer


  try {
    const botResponse = await customMemoryModel(userInput);
    console.log(`botResponse: ${botResponse}`);
    await vocalCords(botResponse);
    const filename = path.join(__dirname, 'audio', 'speechFile.mp3');
    res.download(filename, 'speechFile.mp3', err => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(500).json({ error: 'Error sending file', details: err.message });
      } else {
        console.log('File sent successfully');
      }
    });
  } catch (error) {
    console.error('Error communicating with OpenAI API:', error.message);
    res.status(500).json({ error: 'Error communicating with OpenAI API', details: error.message });
  } finally {
    const endTime = Date.now();  // End the timer
    const duration = endTime - startTime;
    console.log(`Duration: ${duration}ms`);  // Log the duration
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});


const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.MONGODB_URI;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    
    // Connect to the specific database and specific collection
    const database = client.db("TylerDurden"); // Replace with your database name
    const collection = database.collection("Conversations"); // Replace with your collection name
    mongoDbContext = await collection.find({}).toArray();
    console.log(mongoDbContext);

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}

async function saveContextToDatabase() {
  try {
    const client = new MongoClient(uri);
    await client.connect();

    const database = client.db("TylerDurden");
    const collection = database.collection("Conversations");
    console.log(context);
    const query = { _id: context._id };
    const update = { $set: context };

    await collection.updateOne(query, update, { upsert: true });

  } catch (error) {
    console.error('Error saving context to database:', error);
  } finally {
    await client.close();
  }
}


run().catch(console.dir);
