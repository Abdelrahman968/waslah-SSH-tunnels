'use strict';

const Jimp = require('jimp');
const QrCode = require('qrcode-reader');

/**
 * Decodes a QR code image into its raw text payload (used for VLESS/V2Ray
 * "scan to import" config sharing). Returns the decoded string or throws.
 */
function decodeQrFromImage(filePath) {
  return new Promise((resolve, reject) => {
    Jimp.read(filePath, (err, image) => {
      if (err) return reject(err);
      const qr = new QrCode();
      qr.callback = (err2, value) => {
        if (err2 || !value) return reject(err2 || new Error('QR_NOT_FOUND'));
        resolve(value.result);
      };
      qr.decode(image.bitmap);
    });
  });
}

module.exports = { decodeQrFromImage };
