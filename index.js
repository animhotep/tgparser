require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const input = require('input');
const schedule = require('node-schedule');

// Telegram API credentials from .env
const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const phoneNumber = process.env.PHONE_NUMBER;
// Parse channel usernames from environment variable (comma-separated)
const channelUsernames = process.env.CHANNEL_USERNAME.split(',').map(channel => channel.trim());
// Parse search words from environment variable (comma-separated)
const searchWords = process.env.SEARCH_WORD.split(',').map(word => word.trim());
const userId = parseInt(process.env.USER_ID);
const sessionName = process.env.SESSION_NAME;

// Initialize session
const stringSession = new StringSession('');

// Store last checked message ID for each channel to avoid duplicate notifications
const lastCheckedMessageIds = {};

// Helper function to create a delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Function to initialize the Telegram client
async function initClient() {
  console.log('Initializing Telegram client...');

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  // Start the client
  await client.start({
    phoneNumber: async () => phoneNumber, // Use phone number from .env
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
    console.log(`Checking for messages containing any of [${searchWords.join(', ')}] in channels: @${channelUsernames.join(', @')}...`);

    // Process each channel
    for (const channelUsername of channelUsernames) {
      try {
        console.log(`Processing channel @${channelUsername}...`);

        // Get the channel entity
        const channel = await client.getEntity(channelUsername);

        // Get the latest messages
        const messages = await client.getMessages(channel, {
          limit: 10, // Check the last messages
        });

        // Initialize lastCheckedMessageId for this channel if not exists
        if (!lastCheckedMessageIds[channelUsername]) {
          lastCheckedMessageIds[channelUsername] = 0;
        }

        // Filter messages that are newer than the last checked message
        // and contain any of the search words (case insensitive)
        const matchingMessages = messages.filter(msg => {
          if (!(msg.id > lastCheckedMessageIds[channelUsername]) || !msg.text) return false;

          // Check if any of the search words are in the message text
          const messageText = msg.text.toLowerCase();
          return searchWords.some(word => messageText.includes(word.toLowerCase()));
        });

        // Update the last checked message ID for this channel
        if (messages.length > 0) {
          lastCheckedMessageIds[channelUsername] = Math.max(lastCheckedMessageIds[channelUsername], messages[0].id);
        }

        // Send notifications for matching messages
        for (const msg of matchingMessages) {
          const messageLink = `https://t.me/${channelUsername}/${msg.id}`;

          // Find which search words were found in this message
          const messageText = msg.text.toLowerCase();
          const foundWords = searchWords.filter(word => 
            messageText.includes(word.toLowerCase())
          );

          console.log(`Found message containing [${foundWords.join(', ')}] in @${channelUsername}: ${messageLink}`);

          // Add a 1-second delay before sending the message
          await delay(4000);

          // Send notification to the user
          await client.sendMessage(userId, {
            message: `Found message containing [${foundWords.join(', ')}] in @${channelUsername}:\n${messageLink}\n\nContent: ${msg.text.substring(0, 200)}${msg.text.length > 200 ? '...' : ''}`,
          });
        }

        console.log(`Completed checking @${channelUsername}.`);
      } catch (channelError) {
        console.error(`Error processing channel @${channelUsername}:`, channelError);
        // Continue with the next channel even if this one fails
      }
    }

    console.log(new Date() + ': All channels check completed.');
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
    
    schedule.scheduleJob('*/4 * * * *', async () => {
      await checkMessages(client);
    });

    console.log(`Parser is running. Checking channels: @${channelUsernames.join(', @')} for [${searchWords.join(', ')}] every 4 minutes.`);
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

// Run the main function
main();
