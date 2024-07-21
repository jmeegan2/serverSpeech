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

app.post('/chat', async (req, res) => {
  const userInput = req.body.text;
  console.log(`User input: ${userInput}`);

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [{ role: 'user', content: userInput }]
    }, {
      headers: {
        'Authorization': authKey,
        'Content-Type': 'application/json'
      }
    });

    const botResponse = response.data.choices[0].message.content;
    console.log(`Text Response: ${botResponse}`);

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
