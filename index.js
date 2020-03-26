#!/usr/bin/env node

const parser = require('./lib/parser.js');
const fs = require('fs');

if (process.argv.length < 4) {
  console.log("Usage : node mfparser.js file password\n");
}
else {
  let filename = process.argv[2];
  let password = process.argv[3];

  parser.parsePDF(filename, password)
    .then(data => {
      console.log(`Parse Success : Data for ${data.length} funds found.`);

      let outFile = filename + ".json";
      let outData = JSON.stringify(data);

      fs.writeFile(outFile, outData, err => {
        if (err) {
          console.log("An error ocurred creating the file "+ err.message)
        } else {
          console.log("The file has been succesfully saved");
        }
      });
    })
    .catch(console.log);
}
