# DoorBird UDP Event Packet Decryption Guide

This is a guide to capturing, decrypting, and processing DoorBird UDP event broadcast packets. It includes packet structure, decryption steps using the ChaCha20-Poly1305 algorithm, field-by-field explanations, example packets, and example code for handling motion and doorbell events. The original version (Revision 0.36) of this document is the [LAN-2-LAN API FOR DOORBIRD AND BIRDGUARD](https://www.doorbird.com/downloads/api_lan.pdf)

## Event Monitoring (UDP Broadcasts)

After an event occurs, the DoorBird sends multiple identical UDP broadcasts on ports **6524** and **35344** for every user and every connected device. Each packet can be split into two sections: the first contains metadata about the packet, and the second contains encrypted payload information. Please note that DoorBird also sends keep-alive broadcasts every 7 seconds on these two ports. These keep-alive packets do not contain event information and can be ignored, as they will not match the expected packet structure described below.

To decode these UDP packets in **Version 2**, support for the **ChaCha20-Poly1305** algorithm is required. This algorithm is included in the well-known Sodium crypto library (`libsodium`).

### First Part:

| **Fieldname** | **Length in Bytes** | **Datatype** | **Explanation**                                                                                                                                                            |
|---------------|---------------------|--------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `IDENT`       | 3                   | Byte         | Identifier to recognize the packet type.<br><br>`IDENT[0] = 0xDE`<br>`IDENT[1] = 0xAD`<br>`IDENT[2] = 0xBE`                                                                |
| `VERSION`     | 1                   | Byte         | Indicates the encryption and packet type version.<br><br>Currently supported:<br>`0x02` – ChaCha20-Poly1305                                                                |

### Second Part for a Packet in `VERSION 0x02`:

| **Fieldname** | **Length in Bytes** | **Datatype** | **Explanation**                                                                                                                                                           |
|---------------|---------------------|--------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `NONCE`       | 8                   | Byte         | Nonce used for encryption with ChaCha20-Poly1305.                                                                                                                         |
| `CIPHERTEXT`  | 34                  | Byte         | Contains the encrypted data and the authentication tag used by the ChaCha20-Poly1305 encryption algorithm. The encrypted data includes information about the event.<br><br>**Note:**<br>- Encrypted Data: 18 bytes (obtained after decryption).<br>- Authentication Tag: 16 bytes (handled automatically by the decryption algorithm). |

### The `CIPHERTEXT` After Decryption:

| **Fieldname**   | **Length in Bytes** | **Datatype**         | **Explanation**                                                                                             |
|-----------------|---------------------|----------------------|-------------------------------------------------------------------------------------------------------------|
| `INTERCOM_ID`   | 6                   | String               | The first 6 characters of your DoorBird username. Ignore all packets where this does not match your username. |
| `EVENT`         | 8                   | String               | Contains `"doorbell"` or `"motion"` (padded with spaces) to indicate which event was triggered.             |
| `TIMESTAMP`     | 4                   | Unsigned Integer     | A Unix timestamp representing when the event occurred.                                                      |

### Used Algorithms:

| **Version** | **Name**          | **Function**              |
|-------------|-------------------|---------------------------|
| `0x02`      | ChaCha20-Poly1305 | Authenticated Encryption  |

---

## Step-by-Step Example:

### Step 1: Obtain the Encryption Key (Only Needed Once or After Password Change)

Request the key used for decrypting the notifications by calling the `getsession.cgi` endpoint using HTTP Basic Authentication with your DoorBird username and password.

#### Syntax:

```
http://<device-ip>/bha-api/getsession.cgi
```

#### Sample Response:

```json
{
  "BHA": {
    "RETURNCODE": "1",
    "SESSIONID": "ISXA9dzpUfPUSlRNfufdOgGDWRy9WadbtXtB45v9YFc3jMLf4yR50a37gak9f",
    "NOTIFICATION_ENCRYPTION_KEY": "BHYGHyRKtGzBjku2t2jX2UKidXYQ3VqmfbKoCtxXJ6O4lgSzpgIwZ6onrSh"
  }
}
```

- **Note:** The value of `"NOTIFICATION_ENCRYPTION_KEY"` needs to be stored securely and used for decrypting the UDP notification packets. This key remains valid until the user's password changes. The request to obtain this key should not be made for each received packet but stored and reused as needed.

- **Important:** The length of `"NOTIFICATION_ENCRYPTION_KEY"` is between 32 and 64 bytes. For ChaCha20-Poly1305, only the **first 32 bytes** of this key are used. Any additional bytes are ignored by the encryption algorithm.

### Step 2: Capture the UDP Packet

You capture the following packet via UDP:

```
0xDE 0xAD 0xBE 0x02 0x96 0x13 0x80 0xD4 0x62 0x2E 0xBE 0xE7 0x2A 0x9F 0xC3 0xFF 0x0B 0xEF 0x62 0x64 0xF2 0xAE 0x91 0x94 0x92 0x14 0x8B 0xBD 0x30 0xEB 0x05 0xBD 0xCE 0x36 0x7C 0x33 0xD4 0x29 0x3F 0xAF 0xE0 0x60 0x45 0x9E 0x65 0x10
```

### Step 3: Split the Packet

| **Field**     | **Content**                                                                                                                                                                                          |
|---------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `IDENT`       | `0xDE 0xAD 0xBE`                                                                                                                                                                                     |
| `VERSION`     | `0x02`                                                                                                                                                                                               |
| `NONCE`       | `0x96 0x13 0x80 0xD4 0x62 0x2E 0xBE 0xE7`                                                                                                                                                            |
| `CIPHERTEXT`  | `0x2A 0x9F 0xC3 0xFF 0x0B 0xEF 0x62 0x64 0xF2 0xAE 0x91 0x94 0x92 0x14 0x8B 0xBD 0x30 0xEB 0x05 0xBD 0xCE 0x36 0x7C 0x33 0xD4 0x29 0x3F 0xAF 0xE0 0x60 0x45 0x9E 0x65 0x10`<br><br>**Length:** 34 bytes |

### Step 4: Decrypt the `CIPHERTEXT` Using ChaCha20-Poly1305

Use the encryption key obtained in Step 1 and the `NONCE` to decrypt the `CIPHERTEXT`. The decryption should produce the following plaintext:

```
0x67 0x68 0x69 0x6B 0x7A 0x69 0x31 0x20 0x20 0x20 0x20 0x20 0x20 0x20 0x65 0x4D 0x13 0x51
```

### Step 5: Parse the Decrypted Output

| **Field**      | **Byte Value**                                                                                      | **Value**        | **Explanation**                                                                                     |
|----------------|-----------------------------------------------------------------------------------------------------|------------------|-----------------------------------------------------------------------------------------------------|
| `INTERCOM_ID`  | `0x67 0x68 0x69 0x6B 0x7A 0x69`                                                                     | `"ghikzi"`       | Should match the first 6 characters of your DoorBird username. If it doesn't, ignore the packet.     |
| `EVENT`        | `0x31 0x20 0x20 0x20 0x20 0x20 0x20 0x20`                                                           | `"1       "`     | Doorbell number from a D1101 in this example, padded with spaces.                                    |
| `TIMESTAMP`    | `0x65 0x4D 0x13 0x51`                                                                               | `1699550033`     | Unix timestamp.                                                                                      |
|                |                                                                                                     |                  | **Readable Format:** Thursday, 09 November 2023 17:13:53 UTC                                         |

---

## Handling Keep-Alive Packets

- **Explanation:** DoorBird devices send keep-alive packets every 7 seconds on ports 6524 and 35344. These packets do not contain event information and can be ignored.
- **Identification:** Keep-alive packets may not match the `IDENT` and `VERSION` fields described above. By checking these fields and ensuring they match the expected values (`IDENT = 0xDE 0xAD 0xBE` and `VERSION = 0x02`), you can safely ignore any packets that do not conform to the event packet structure.

---

## Example Source Code

The following C code demonstrates the decryption part using `libsodium` method calls. It uses a few internal structs, methods, and macros, which are self-explanatory.

### Decryption:

```c
NotifyBroadcastCiphertext decryptBroadcastNotification(const NotifyBroadcast* notification, const Password* password) {
  NotifyBroadcastCiphertext decrypted = {{0}, {0}, 0};
  if (crypto_aead_chacha20poly1305_decrypt(
        (unsigned char*)&decrypted, NULL, NULL,
        notification->ciphertext, sizeof(notification->ciphertext),
        NULL, 0, notification->nonce, password->key) != 0) {
    LOGGING("crypto_aead_chacha20poly1305_decrypt() failed");
  }
  return decrypted;
}
```

---

## Notes and Clarifications

- **Packet Structure Validation:** When processing incoming UDP packets, ensure that:
  - The packet is at least 4 bytes long.
  - The `IDENT` matches `0xDE 0xAD 0xBE`.
  - The `VERSION` is `0x02`.

- **Encryption Key Handling:**
  - Store the encryption key securely after obtaining it.
  - Use only the first 32 bytes of the `NOTIFICATION_ENCRYPTION_KEY` for decryption.

- **Duplicate Packet Detection:**
  - DoorBird devices may send multiple identical packets for a single event.
  - Implement logic to detect and ignore duplicate packets received within a short time frame (e.g., 750 milliseconds).

- **Event Handling:**
  - After successfully decrypting and parsing the packet, handle the events based on the `EVENT` field.
    - For `"motion"`, trigger motion event handling logic.
    - For `"doorbell"`, trigger doorbell event handling logic.

- **Time Conversion:**
  - The `TIMESTAMP` field is a Unix timestamp in seconds.
  - Convert it to a human-readable date and time format as needed.

---
