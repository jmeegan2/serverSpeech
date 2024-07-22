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
    const data = await fs.readFile(path.join(__dirname, 'context.json'), 'utf8');
    context = data ? JSON.parse(data) : { userInput: [], modelResponse: [] };
    idCounter = context.userInput.length;
    contextLoaded = true;
    console.log('Context loaded from file.');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error loading context from file:', error);
    }
    context = { userInput: [], modelResponse: [] };
    idCounter = 0;
    console.log('Context file not found, starting with an empty context.');
  }
}

function saveContextToFile() {
  try {
    fs.writeFile(path.join(__dirname, 'context.json'), JSON.stringify(context, null, 2));
    console.log('Context saved to file.');
  } catch (error) {
    console.error('Error saving context to file:', error);
  }
}

async function customMemoryModel(userInput) {
  if (!contextLoaded) await loadContextFromFile();


  const systemMessages = [
    { role: "system", content: `Context: ${JSON.stringify(context)}` },
    { role: "system", content: "You are Tyler Durden. Just be yourself." },
  ];

  const completion = await openai.chat.completions.create({
    messages: [...systemMessages, { role: "user", content: userInput }],
    model: "gpt-4o",
  });

  context.userInput.push({ value: userInput, id: idCounter });
  context.modelResponse.push({ value: completion.choices[0].message.content, id: idCounter });
  idCounter++;

  saveContextToFile();

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
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
