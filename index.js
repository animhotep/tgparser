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
const searchWord = process.env.SEARCH_WORD;
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

// Function to check for new messages containing the search word
async function checkMessages(client) {
  try {
    console.log(`Checking for messages containing "${searchWord}" in @${channelUsername}...`);

    // Get the channel entity
    const channel = await client.getEntity(channelUsername);

    // Get the latest messages
    const messages = await client.getMessages(channel, {
      limit: 20, // Check the last 20 messages
    });

    // Filter messages that are newer than the last checked message
    // and contain the search word (case insensitive)
    const matchingMessages = messages.filter(
      msg => 
        msg.id > lastCheckedMessageId && 
        msg.text && 
        msg.text.toLowerCase().includes(searchWord.toLowerCase())
    );

    // Update the last checked message ID
    if (messages.length > 0) {
      lastCheckedMessageId = Math.max(lastCheckedMessageId, messages[0].id);
    }

    // Send notifications for matching messages
    for (const msg of matchingMessages) {
      const messageLink = `https://t.me/${channelUsername}/${msg.id}`;
      console.log(`Found matching message: ${messageLink}`);

      // Send notification to the user
      await client.sendMessage(userId, {
        message: `Found message containing "${searchWord}":\n${messageLink}\n\nContent: ${msg.text.substring(0, 200)}${msg.text.length > 200 ? '...' : ''}`,
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

    console.log(`Parser is running. Checking @${channelUsername} for "${searchWord}" every 3 minutes.`);
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

// Run the main function
main();
