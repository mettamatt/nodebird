# Nodebird

Nodebird is a Node.js application that listens for UDP broadcasts from a DoorBird video station, decrypts the messages using ChaCha20-Poly1305, and outputs event information such as doorbell rings or motion detection.

## Features

- Listens on ports `6524` and `35344` for UDP broadcasts.
- Decrypts messages using ChaCha20-Poly1305 encryption.
- Parses and displays event information from the DoorBird device.

## Prerequisites

- Node.js v12 or higher
- npm
- Access to your DoorBird device's IP address and user credentials.

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/mettamatt/nodebird.git
   cd nodebird
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure your DoorBird credentials:

   - Create a `.env` file in the root of the project:
   
     ```bash
     touch .env
     ```

   - Add your DoorBird device's IP address, username, and password to the `.env` file:

     ```plaintext
     DOORBIRD_IP=192.168.x.x
     DOORBIRD_USERNAME=your_username
     DOORBIRD_PASSWORD=your_password
     ```

   **Note:** Ensure the `.env` file is added to your `.gitignore` to keep your credentials secure and out of version control.

4. Run the application.

## Usage

- **Start the application:**

  ```bash
  npm start
  ```

- **Start the application with auto-reloading (development mode):**

  ```bash
  npm run dev
  ```

## License

This project is licensed under the MIT License.

## Acknowledgments

- [DoorBird API Documentation](https://www.doorbird.com/api)
- [libsodium](https://github.com/jedisct1/libsodium.js)