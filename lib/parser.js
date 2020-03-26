const verbose = false;

const parseCurrency = currency_str => parseFloat(currency_str.replace(',',''));

const parseRawJSON = pdfData  => {
  let fundlist = [];
  let pdfpan = '';
  let curfund = null;
  let curtrans = { };
  let stage = 0;
  let widthFactor = pdfData.formImage.Width / (8.5 * 72);

  if (verbose) {
    console.log(`WidthFactor = ${widthFactor}`);
  }

  for (let pdfPageIdx in pdfData.formImage.Pages) {
    let tableHeaders = {};
    let pdfPage = pdfData.formImage.Pages[pdfPageIdx];

    for (let pdfTextIdx in pdfPage.Texts) {
      let pdfText = pdfPage.Texts[pdfTextIdx];

      //
      // Read the header to get the positions of various entries in the PDF
      //
      if (Object.keys(tableHeaders).length < 6)
      {
        if (pdfText.R[0].T === 'Date')
        {
          tableHeaders[pdfText.R[0].T] = pdfText.x;
        } else if ( 
          pdfText.R[0].T === 'Transaction' || 
          pdfText.R[0].T === 'Amount' || 
          pdfText.R[0].T === 'Price' || 
          pdfText.R[0].T === 'Balance' || 
          pdfText.R[0].T === 'Units'
        ) {
          tableHeaders[pdfText.R[0].T] = pdfText.x + pdfText.w * widthFactor;
        }
      }

      //
      // This reads the details of each mutual fund
      //
      else if (stage == 0) {
        //  Read metadata: Fund Name, PAN, Folio No
        if (pdfText.R[0].T.startsWith('Folio%20No')) {
          let folioNo = decodeURIComponent(pdfText.R[0].T.substr(16));
          let panIdx = pdfTextIdx - 4;
          let panStr = pdfPage.Texts[panIdx].R[0].T;

          if (panStr.startsWith('KYC')) {
            panIdx--;
            panStr = pdfPage.Texts[panIdx].R[0].T;
          }

          curfund = {
            Name : decodeURIComponent(pdfPage.Texts[panIdx + 2].R[0].T),
            Labels : {Folio: folioNo},
            Transactions : []
          };

          if (panStr.startsWith('PAN')) {
            pdfpan = curfund.Labels.PAN = decodeURIComponent(panStr.substr(9));
          } else {
            curfund.Labels.PAN = pdfpan;
          }

          fundlist.push(curfund);
        }
        else if (pdfText.R[0].T.startsWith('%20Opening')) {
          ++stage;
          curtrans = {};
        }
      }

      //
      // Read the transaction details for each transaction
      //
      else if (stage == 1) {
        if (pdfText.R[0].T.startsWith('NAV')) {
          --stage;
        } else {
          // Code to match cell entry with heading
          let paramDist = 1;
          let chosen = -1;

          for (let param of Object.keys(tableHeaders)) {
            let tokenPos = pdfText.x;

            if (param != 'Date') {
              tokenPos += pdfText.w * widthFactor;
            }

            if (Math.abs(tableHeaders[param] - tokenPos) < paramDist) {
              paramDist = Math.abs(tableHeaders[param] - tokenPos);
              chosen = param;
            }
          }

          // Special case to match strings to Transaction heading
          if(/^[A-Za-z]/.test(pdfText.R[0].T)) {
            chosen = 'Transaction';
          }

          // Parse the data into entry
          if (chosen != -1) {
            if (curtrans[chosen] != null) {
              if (verbose) {
                console.log(`${fundlist.length} - Incomplete entry ${curtrans.Date}`);
              }
              curtrans = {};
            }

            if (chosen == 'Date') {
              curtrans[chosen] = pdfText.R[0].T;
            } else if (chosen == 'Transaction') {
              curtrans[chosen] = decodeURIComponent(pdfText.R[0].T);
            } else {
              let valueStr = decodeURIComponent(pdfText.R[0].T);

              if (valueStr.includes('(')) {
                curtrans[chosen] = -parseCurrency(valueStr.substr(1, valueStr.length - 2));
              } else {
                curtrans[chosen] = parseCurrency(valueStr);
              }
            }

            if (verbose) {
              console.log(`${chosen}: ${pdfText.R[0].T}`);
            }
          }

          if (Object.keys(curtrans).length == 6) {
            if (verbose) {
              console.log(`${fundlist.length} - Pushing entry ${curtrans.Date}`);
            }
            curfund.Transactions.push(curtrans);
            curtrans = {};
          }
        }
      }
    }
  }

  return fundlist;
}

exports.parsePDF = (filename, pdf_pass) => {
  return new Promise((resolve, reject) => {
    const PDFParser = require('pdf2json');

    let pdfParser = new PDFParser(null, false);

    pdfParser.on('pdfParser_dataError', errData => {
      reject(errData.parserError);
    });

    pdfParser.on('pdfParser_dataReady', pdfData => {
      if (verbose) {
        console.log('Begin parsing structure for ' + filename);
      }

      const data = parseRawJSON(pdfData);
      if (data === undefined) {
        reject('Couldnt parse CAS structure from file, unsupported PDF.');
      }

      resolve(data);
    });

    if (verbose) {
      console.log('Opening PDF file ' + filename);
    }

    pdfParser.setPassword(pdf_pass);
    pdfParser.loadPDF(filename);
  });
}
