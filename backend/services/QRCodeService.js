import QRCode from "qrcode";

// Generate a QR code that opens the public container-tracking page.
async function generateTrackingQRCode(containerNumber) {
  // Use the configured public tracking URL.
  const trackingPageURL =
    process.env.PUBLIC_TRACKING_URL || "http://localhost:5173/track";

  // Add the container number to the tracking URL.
  const trackingURL = new URL(trackingPageURL);
  trackingURL.searchParams.set("containerNumber", containerNumber);

  // Generate the QR code as a PNG image buffer.
  const qrCodeBuffer = await QRCode.toBuffer(trackingURL.toString(), {
    type: "png",
    errorCorrectionLevel: "H",
    width: 300,
    margin: 2,
  });

  return qrCodeBuffer;
}

export default generateTrackingQRCode;
