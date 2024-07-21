const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');  // Add this line
const fs = require('fs');
const app = express();
const port = 3000;
app.use(bodyParser.json());
app.use(cors());  // Add this line
const { authKey } = require('./secretKeys.js');  // Import the authKey from config.js
let i = 0;
app.post('/chat', async (req, res) => {
  const userInput = req.body.text;
  console.log(`User input: ${userInput}`);


  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [
        { 
            role: 'user', 
        content: userInput 
    }
]
    }, {
      headers: {
        'Authorization': authKey,
        'Content-Type': 'application/json'
      }
    });

    const botResponse = response.data.choices[0].message.content;
    console.log(`Text Response: ${botResponse}`)
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
    let filename = 'audio/output.mp3'
    fs.writeFileSync(filename, Buffer.from(speechResponse.data));    //breaks whole thing

    res.json({ response: botResponse, filename });
  } catch (error) {
    console.log(error)
    console.error('Error communicating with OpenAI API:', error.message);
    res.status(500).json({ error: 'Error communicating with OpenAI API', details: error.message });
  }
});

app.listen(port, () => { 
  console.log(`Server running at http://localhost:${port}/`);
});