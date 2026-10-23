// WISP - print the Windows playback peak (what the screensaver's media guard sees).
const peak = require('../src/main/audioPeak').create();
(async () => { for (let i = 0; i < 5; i++) console.log('peak', await peak(500)); })();
