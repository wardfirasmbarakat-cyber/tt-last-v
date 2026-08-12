import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

async function main() {
  try {
    const configPath = "firebase-applet-config.json";
    if (!fs.existsSync(configPath)) {
      console.log("No config file found!");
      return;
    }
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const app = initializeApp(firebaseConfig, "diagnostic-list-shifts");
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

    const snap = await getDocs(collection(db, "shifts"));
    console.log(`Found ${snap.size} shifts:`);
    snap.forEach((doc) => {
      console.log(doc.id, "=>", doc.data());
    });
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
