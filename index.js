require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const input = require('input');
const schedule = require('node-schedule');

// Telegram API credentials from .env
const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const channelUsername = process.env.CHANNEL_USERNAME;
// Parse search words from environment variable (comma-separated)
const searchWords = process.env.SEARCH_WORD.split(',').map(word => word.trim());
const userId = parseInt(process.env.USER_ID);
const sessionName = process.env.SESSION_NAME;

// Initialize session
const stringSession = new StringSession('');

// Store last checked message ID to avoid duplicate notifications
let lastCheckedMessageId = 0;

// Function to initialize the Telegram client
async function initClient() {
  console.log('Initializing Telegram client...');

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  // Start the client
  await client.start({
    phoneNumber: async () => await input.text('Please enter your phone number: '),
    password: async () => await input.text('Please enter your password: '),
    phoneCode: async () => await input.text('Please enter the code you received: '),
    onError: (err) => console.log(err),
  });

  console.log('Client initialized successfully!');
  console.log('Session string:', client.session.save());

  return client;
}

// Function to check for new messages containing any of the search words
async function checkMessages(client) {
  try {
    console.log(`Checking for messages containing any of [${searchWords.join(', ')}] in @${channelUsername}...`);

    // Get the channel entity
    const channel = await client.getEntity(channelUsername);

    // Get the latest messages
    const messages = await client.getMessages(channel, {
      limit: 20, // Check the last 20 messages
    });

    // Filter messages that are newer than the last checked message
    // and contain any of the search words (case insensitive)
    const matchingMessages = messages.filter(msg => {
      if (!(msg.id > lastCheckedMessageId) || !msg.text) return false;

      // Check if any of the search words are in the message text
      const messageText = msg.text.toLowerCase();
      return searchWords.some(word => messageText.includes(word.toLowerCase()));
    });

    // Update the last checked message ID
    if (messages.length > 0) {
      lastCheckedMessageId = Math.max(lastCheckedMessageId, messages[0].id);
    }

    // Send notifications for matching messages
    for (const msg of matchingMessages) {
      const messageLink = `https://t.me/${channelUsername}/${msg.id}`;

      // Find which search words were found in this message
      const messageText = msg.text.toLowerCase();
      const foundWords = searchWords.filter(word => 
        messageText.includes(word.toLowerCase())
      );

      console.log(`Found message containing [${foundWords.join(', ')}]: ${messageLink}`);

      // Send notification to the user
      await client.sendMessage(userId, {
        message: `Found message containing [${foundWords.join(', ')}]:\n${messageLink}\n\nContent: ${msg.text.substring(0, 200)}${msg.text.length > 200 ? '...' : ''}`,
      });
    }

    console.log('Check completed.');
  } catch (error) {
    console.error('Error checking messages:', error);
  }
}

// Main function
async function main() {
  try {
    // Initialize the client
    const client = await initClient();

    // Perform initial check
    await checkMessages(client);

    // Schedule regular checks every 3 minutes
    schedule.scheduleJob('*/3 * * * *', async () => {
      await checkMessages(client);
    });

    console.log(`Parser is running. Checking @${channelUsername} for [${searchWords.join(', ')}] every 3 minutes.`);
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

// Run the main function
main();
