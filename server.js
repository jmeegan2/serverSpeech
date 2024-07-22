const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs').promises; // Use fs.promises for async/await
const path = require('path'); // Require the path module
const app = express();
const port = 3000;
app.use(bodyParser.json());
app.use(cors());
const { authKey } = require('./secretKeys.js');


const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
  apiKey: process.env.authKey,
});

const openai = new OpenAIApi(configuration);

async function runCompletion() {
  const response = await openai.createCompletion({
    model: 'text-davinci-003',
    prompt: 'Hello, world!',
    max_tokens: 5,
  });

  console.log(response.data.choices[0].text);
}

runCompletion();



app.post('/chat', async (req, res) => {
  const userInput = req.body.text;
  console.log(`User input: ${userInput}`);

  try {
  
    const botResponse = await talkToAssistant(userInput) 
    console.log(`Assistant Response: ${botResponse}`);

    const speechResponse = await axios.post('https://api.openai.com/v1/audio/speech', {
      model: "tts-1",
      input: botResponse,
      voice: "onyx"
    }, {
      headers: {
        'Authorization': authKey,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer'
    });

    let filename = path.join(__dirname, 'audio', 'output.mp3');
    console.log(`Writing file to ${filename}`);
    await fs.writeFile(filename, Buffer.from(speechResponse.data)); // Use async writeFile
    console.log('File written successfully');

    // Ensure the file is written before sending it
    await fs.access(filename);
    console.log('File exists, sending to client');

    // Send the file back to the client
    res.download(filename, 'output.mp3', (err) => {
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


// Function to send user input to the assistant and receive the response
async function talkToAssistant(userInput) {
  try {
    const assistantId = 'asst_yQfJncVuJQg3PL40dO7Awyxu'; // Replace with your unique assistant ID

    // Step 1: Create a new thread
    const assistant = await openai.beta.assistants.create({
      name: "Math Tutor",
      instructions: "You are a personal math tutor. Write and run code to answer math questions.",
      tools: [{ type: "code_interpreter" }],
      model: "gpt-4o"
    });

    const res

    // Step 2: Add user message to the thread
    await axios.post(`https://api.openai.com/v1/assistants/threads/${threadId}/messages`, {
      role: 'user',
      content: userInput
    }, {
      headers: {
        'Authorization': authKey,
        'Content-Type': 'application/json'
      }
    });

    // Step 3: Create a run on the thread using the assistant ID
    const runResponse = await axios.post(`https://api.openai.com/v1/assistants/threads/${threadId}/runs`, {
      assistant_id: assistantId
    }, {
      headers: {
        'Authorization': authKey,
        'Content-Type': 'application/json'
      }
    });

    // Step 4: Get the response from the assistant
    const messagesResponse = await axios.get(`https://api.openai.com/v1/assistants/threads/${threadId}/messages`, {
      headers: {
        'Authorization': authKey,
        'Content-Type': 'application/json'
      }
    });

    const assistantResponse = messagesResponse.data.messages.find(msg => msg.role === 'assistant').content;
    console.log('Assistant:', assistantResponse);

    return assistantResponse;

  } catch (error) {
    console.error('Error communicating with the assistant:', error);
    throw error;
  }
}