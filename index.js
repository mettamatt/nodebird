// index.js

// Import required modules
const dgram = require('dgram');
const fetch = require('node-fetch');
const sodium = require('libsodium-wrappers');

(async () => {
  // Wait for libsodium to be ready
  await sodium.ready;

  // Configuration variables
  const DOORBIRD_IP = '192.168.x.x'; // Replace with your DoorBird IP
  const USERNAME = 'your_username';
  const PASSWORD = 'your_password';
  const PORTS = [6524, 35344];

  let encryptionKey;

  // Function to fetch the encryption key
  async function getEncryptionKey() {
    const url = `http://${DOORBIRD_IP}/bha-api/getsession.cgi`;
    const response = await fetch(url, {
      headers: {
        'Authorization':
          'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64'),
      },
    });

    if (!response.ok) {
      throw new Error(
        `Error fetching encryption key: ${response.statusText}`
      );
    }

    const data = await response.json();
    const keyBase64 = data.BHA.NOTIFICATION_ENCRYPTION_KEY;
    // Decode base64 key and use the first 32 bytes
    return Buffer.from(keyBase64, 'base64').slice(0, 32);
  }

  // Get the encryption key
  try {
    encryptionKey = await getEncryptionKey();
    console.log('Encryption key obtained');
  } catch (error) {
    console.error('Failed to obtain encryption key:', error);
    process.exit(1);
  }

  // Create UDP socket
  const udpSocket = dgram.createSocket('udp4');

  // Listen on specified ports
  PORTS.forEach((port) => {
    udpSocket.bind(port, () => {
      udpSocket.setBroadcast(true);
      console.log(`Listening for UDP broadcasts on port ${port}`);
    });
  });

  // Handle incoming messages
  udpSocket.on('message', (msg, rinfo) => {
    try {
      // Parse the incoming message
      const IDENT = msg.slice(0, 3);
      const VERSION = msg.readUInt8(3);
      const NONCE = msg.slice(4, 12);
      const CIPHERTEXT = msg.slice(12);

      // Verify IDENT and VERSION
      if (IDENT.toString('hex') !== 'deadbe' || VERSION !== 0x02) {
        console.log('Unrecognized packet format');
        return;
      }

      // Decrypt the ciphertext
      const decrypted = sodium.crypto_aead_chacha20poly1305_decrypt(
        null,
        CIPHERTEXT,
        null,
        NONCE,
        encryptionKey
      );

      // Extract information from decrypted data
      const INTERCOM_ID = decrypted.slice(0, 6).toString('ascii');
      const EVENT = decrypted.slice(6, 14).toString('ascii').trim();
      const TIMESTAMP = decrypted.slice(14, 18).readUInt32BE(0);

      // Verify INTERCOM_ID matches the first 6 chars of your username
      if (INTERCOM_ID !== USERNAME.substring(0, 6)) {
        console.log('INTERCOM_ID does not match, ignoring packet');
        return;
      }

      // Output event information
      console.log(`Event: ${EVENT}`);
      console.log(
        `Timestamp: ${new Date(TIMESTAMP * 1000).toISOString()}`
      );
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
})();
