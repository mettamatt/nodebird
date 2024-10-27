// index.js

import dotenv from 'dotenv';
dotenv.config();

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
    console.error(
      'Missing required environment variables. Check your .env file.'
    );
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

    // Use the key string directly as bytes
    let keyBuffer = Buffer.from(keyString, 'utf8');
    // Verify key buffer length
    if (keyBuffer.length < 32) {
      console.error(
        `Key buffer length is too short: ${keyBuffer.length} bytes`
      );
      throw new Error('Invalid encryption key length');
    }

    // Use the first 32 bytes for the encryption key
    return keyBuffer.slice(0, 32);
  }

  // Get the encryption key
  try {
    encryptionKey = await getEncryptionKey();
    console.log('Encryption key obtained.');
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

    // Variables for duplicate packet detection
    let lastPacketData = null;
    let lastPacketTime = 0;

    // Handle incoming messages
    udpSocket.on('message', async (msg, rinfo) => {
      try {
        const now = Date.now();

        // Check for duplicate packet
        if (
          lastPacketData &&
          msg.equals(lastPacketData) &&
          now - lastPacketTime < 750
        ) {
          console.log('Duplicate packet received, ignoring.');
          return;
        }

        // Update last packet info
        lastPacketData = Buffer.from(msg);
        lastPacketTime = now;

        // Check if the message is at least 4 bytes long
        if (msg.length < 4) {
          return; // Ignore short messages
        }

        // Parse the IDENT and VERSION fields
        const IDENT = msg.slice(0, 3);
        const VERSION = msg.readUInt8(3);

        // Check for Version 2 event packet
        if (IDENT.toString('hex') === 'deadbe' && VERSION === 0x02) {
          // This is a Version 2 event packet
          const NONCE = msg.slice(4, 12); // 8 bytes
          const CIPHERTEXT = msg.slice(12);

          // Log packet details
          console.log(
            `Received Version 2 packet from ${rinfo.address}:${rinfo.port}`
          );

          // Verify lengths
          if (NONCE.length !== 8) {
            console.error(
              `Invalid nonce length: expected 8, got ${NONCE.length}`
            );
            return;
          }

          if (CIPHERTEXT.length < 32) {
            console.error(
              'Ciphertext too short to contain encrypted data and authentication tag.'
            );
            return;
          }

          // Decrypt the encrypted data
          let plaintext;
          try {
            plaintext = sodium.crypto_aead_chacha20poly1305_decrypt(
              null, // nsec, not used
              CIPHERTEXT, // Use the entire ciphertext
              null, // Additional data, none
              NONCE,
              encryptionKey
            );
            console.log('Decryption successful.');
          } catch (e) {
            // Decryption failed; likely not intended for us
            console.log(
              'Decryption failed; packet may not be intended for this device.',
              e
            );
            return;
          }

          // Process the decrypted data
          processDecryptedData(plaintext);
        } else {
          // Ignore non-Version 2 packets
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('Shutting down UDP listener...');
      udpSocket.close();
      process.exit();
    });
  });

  function processDecryptedData(plaintext) {
    // Convert plaintext to Buffer for easier handling
    const plaintextBuffer = Buffer.from(plaintext);

    if (plaintextBuffer.length !== 18) {
      console.log('Decrypted text length is invalid, must be 18 bytes');
      return;
    }

    // Extract information from decrypted data
    const INTERCOM_ID = plaintextBuffer.slice(0, 6).toString('ascii').trim();
    const EVENT = plaintextBuffer.slice(6, 14).toString('ascii').trim();
    const TIMESTAMP = plaintextBuffer.slice(14, 18).readUInt32BE(0);

    // Verify INTERCOM_ID matches the first 6 chars of your username
    if (INTERCOM_ID !== USERNAME.substring(0, 6)) {
      console.log('INTERCOM_ID does not match, ignoring packet');
      return;
    }

    // Handle different events
    if (EVENT.toLowerCase() === 'motion') {
      handleMotionEvent(TIMESTAMP);
    } else {
      handleDoorbellEvent(TIMESTAMP);
    }
  }

  function handleMotionEvent(timestamp) {
    console.log(
      `Motion detected at ${new Date(timestamp * 1000).toISOString()}`
    );
    // Implement your motion event handling logic here
  }

  function handleDoorbellEvent(timestamp) {
    console.log(`Doorbell rung at ${new Date(timestamp * 1000).toISOString()}`);
    // Implement your doorbell event handling logic here
  }
})();
