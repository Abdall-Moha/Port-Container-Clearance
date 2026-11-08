// English is the source language and the fallback for untranslated keys.
import somali from "./so.js";

// English source phrases are the stable dictionary keys used by each component.
const english = Object.fromEntries(Object.keys(somali).map((phrase) => [phrase, phrase]));

export default english;
