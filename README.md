# Rafiki OS

Rafiki OS is a voice-first operating system built on top of the OpenAI Realtime API. This will enable those in Kenya to interact with their devices and services using voice.

# ToDos
- [x] Show chat conversation
- [ ] Upload images

# Starting the console

```shell
$ npm i
```

Start your server with:

```shell
$ npm start
```

It should be available via `localhost:3000`.

Now start the relay server with:

```shell
$ npm run relay
```

It will start automatically on `localhost:8081`.

**You will need to create a `.env` file** with the following configuration:

```conf
OPENAI_API_KEY=YOUR_API_KEY
REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
```

You will need to restart both your React app and relay server for the `.env.` changes
to take effect. The local server URL is loaded via [`ConsolePage.tsx`](/src/pages/ConsolePage.tsx).
To stop using the relay server at any time, simply delete the environment
variable or set it to empty string.