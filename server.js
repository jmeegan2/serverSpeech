require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs').promises; // Corrected import
const path = require('path');
const OpenAIApi = require('openai');
const openai = new OpenAIApi({ apiKey: process.env.OPENAI_API_KEY });
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const port = 3000;
app.use(bodyParser.json());
app.use(cors());



async function theMind(userInput) {
  try {
    const thread = await openai.beta.threads.create();
    const message = await openai.beta.threads.messages.create(
      thread.id,
      {
        role: "user",
        content: userInput
      }
    );
    let run = await openai.beta.threads.runs.createAndPoll(
      thread.id,
      { 
        assistant_id: 'asst_yQfJncVuJQg3PL40dO7Awyxu',
      }
    );

    if (run.status === 'completed') {
      const messages = await openai.beta.threads.messages.list(
        run.thread_id
      );
      console.log(messages.data[0].content[0].text.value)
      return(messages.data[0].content[0].text.value)
    } else {
      console.log(run.status);
    }
  } catch (error) {
    console.error('Error in theMind function:', error.message);
    throw error;
  }
}



async function vocalCords(botResponse){
  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: "alloy",
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
  
    const botResponse = await theMind(userInput) 
    console.log(`Assistant Response: ${botResponse}`);
    await vocalCords(botResponse)
    let filename = path.join(__dirname, 'audio', 'speechFile.mp3');
    res.download(filename, 'speechFile.mp3', (err) => {
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
  console.log(process.env.OPENAI_API_KEY)
  console.log(`Server running at http://localhost:${port}/`);
});

