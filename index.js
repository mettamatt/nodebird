// index.js

import dgram from 'dgram';
import fetch from 'node-fetch';
import sodium from 'libsodium-wrappers';

(async () => {
  // Initialize sodium
  await sodium.ready;

  // Use environment variables
  const DOORBIRD_IP = process.env.DOORBIRD_IP;
  const USERNAME = process.env.DOORBIRD_USERNAME;
  const PASSWORD = process.env.DOORBIRD_PASSWORD;
  const PORTS = [6524, 35344];
  
  // Ensure required environment variables are set
  if (!DOORBIRD_IP || !USERNAME || !PASSWORD) {
    console.error("Missing required environment variables. Check your .env file.");
    process.exit(1);
  }

  let encryptionKey;

  // Function to fetch the encryption key
  async function getEncryptionKey() {
    const url = `http://${DOORBIRD_IP}/bha-api/getsession.cgi`;
    const response = await fetch(url, {
      headers: {
        Authorization:
          'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64'),
      },
    });

    const responseBody = await response.text();

    if (!response.ok) {
      console.error(`Error fetching encryption key: ${response.statusText}`);
      console.error('Response body:', responseBody);
      throw new Error(`Error fetching encryption key: ${response.statusText}`);
    }

    let data;
    try {
      data = JSON.parse(responseBody);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      console.error('Response body:', responseBody);
      throw new Error('Invalid JSON response from DoorBird device');
    }

    const keyString = data.BHA.NOTIFICATION_ENCRYPTION_KEY;

    if (!keyString || keyString.length === 0) {
      console.error('NOTIFICATION_ENCRYPTION_KEY is missing or empty.');
      throw new Error('Failed to retrieve encryption key from response.');
    }

    // Print the raw key
    console.log(`Raw NOTIFICATION_ENCRYPTION_KEY: ${keyString}`);

    // Ensure the base64 string is correctly padded
    let paddedKeyString = keyString;
    const paddingNeeded = (4 - (keyString.length % 4)) % 4;
    if (paddingNeeded > 0) {
      paddedKeyString += '='.repeat(paddingNeeded);
    }

    // Decode the key
    let decodedKey = Buffer.from(paddedKeyString, 'base64');
    console.log(`Padded key string length: ${paddedKeyString.length}`);
    console.log(`Decoded key length: ${decodedKey.length} bytes`);
    console.log(`Decoded key (hex): ${decodedKey.toString('hex')}`);

    // Verify decoded key length
    if (decodedKey.length < 32) {
      console.error(`Decoded key length is too short: ${decodedKey.length} bytes`);
      throw new Error('Invalid encryption key length');
    }

    // Use the first 32 bytes for the encryption key
    return decodedKey.slice(0, 32);
  }

  // Get the encryption key
  try {
    encryptionKey = await getEncryptionKey();
    console.log('Encryption key obtained');
  } catch (error) {
    console.error('Failed to obtain encryption key:', error);
    process.exit(1);
  }

  // Listen on specified ports
  PORTS.forEach((port) => {
    // Create UDP socket for each port
    const udpSocket = dgram.createSocket('udp4');

    udpSocket.bind(port, () => {
      udpSocket.setBroadcast(true);
      console.log(`Listening for UDP broadcasts on port ${port}`);
    });

    // Handle incoming messages
    udpSocket.on('message', async (msg, rinfo) => {
      try {
        // Check if the message is at least 4 bytes long
        if (msg.length < 4) {
          return; // Ignore short messages
        }

        // Parse the IDENT and VERSION fields
        const IDENT = msg.slice(0, 3);
        const VERSION = msg.readUInt8(3);

        // Check for event packet
        if (IDENT.toString('hex') === 'deadbe' && VERSION === 0x02) {
          // This is an event packet
          const NONCE = msg.slice(4, 12); // 8 bytes
          const CIPHERTEXT = msg.slice(12);

          // Log packet details
          console.log(`Received packet from ${rinfo.address}:${rinfo.port}`);
          console.log(`NONCE length: ${NONCE.length}`);
          console.log(`NONCE: ${NONCE.toString('hex')}`);
          console.log(`CIPHERTEXT length: ${CIPHERTEXT.length}`);
          console.log(`CIPHERTEXT: ${CIPHERTEXT.toString('hex')}`);

          // Verify lengths
          if (NONCE.length !== 8) {
            console.error(`Invalid nonce length: expected 8, got ${NONCE.length}`);
            return;
          }

          if (CIPHERTEXT.length < 32) {
            console.error('Ciphertext too short to contain encrypted data and authentication tag.');
            return;
          }

          // Split the CIPHERTEXT
          const randomData = CIPHERTEXT.slice(0, 16); // First 16 bytes are random data
          const encryptedDataWithTag = CIPHERTEXT.slice(16); // Remaining bytes

          // Decrypt the encrypted data
          let plaintext;
          try {
            plaintext = sodium.crypto_aead_chacha20poly1305_decrypt(
              null, // nsec, not used
              encryptedDataWithTag,
              null, // Additional data, none
              NONCE,
              encryptionKey
            );
            console.log('Decryption successful.');
          } catch (e) {
            console.error('Decryption failed:', e.message);
            // Optionally refresh the encryption key and retry
            return;
          }

          // Convert plaintext to Buffer for easier handling
          const plaintextBuffer = Buffer.from(plaintext);

          console.log(`Plaintext (hex): ${plaintextBuffer.toString('hex')}`);

          // Extract information from decrypted data
          const INTERCOM_ID = plaintextBuffer.slice(0, 6).toString('ascii');
          const EVENT = plaintextBuffer.slice(6, 14).toString('ascii').trim();
          const TIMESTAMP = plaintextBuffer.slice(14, 18).readUInt32BE(0);

          console.log(`INTERCOM_ID: ${INTERCOM_ID}`);
          console.log(`USERNAME (first 6 chars): ${USERNAME.substring(0, 6)}`);
          console.log(`EVENT: ${EVENT}`);
          console.log(`TIMESTAMP: ${new Date(TIMESTAMP * 1000).toISOString()}`);

          // Verify INTERCOM_ID matches the first 6 chars of your username
          if (INTERCOM_ID !== USERNAME.substring(0, 6)) {
            console.log('INTERCOM_ID does not match, ignoring packet');
            return;
          }

          // Output event information
          console.log(`Event: ${EVENT}`);
          console.log(`Timestamp: ${new Date(TIMESTAMP * 1000).toISOString()}`);
        } else {
          // Ignore non-event packets
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });
  });
})();
