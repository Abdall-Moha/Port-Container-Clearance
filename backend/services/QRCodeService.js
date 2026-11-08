import QRCode from "qrcode";

// Build the public tracking URL and add this container without discarding existing query parameters.
function buildTrackingURL(containerNumber) {
  const configuredURL = process.env.PUBLIC_TRACKING_URL?.trim();

  if (!configuredURL) {
    throw new Error("PUBLIC_TRACKING_URL is required to generate a Release Order QR code.");
  }

  let trackingURL;
  try {
    trackingURL = new URL(configuredURL);
  } catch {
    throw new Error("PUBLIC_TRACKING_URL must be a valid absolute URL.");
  }

  if (!['http:', 'https:'].includes(trackingURL.protocol)) {
    throw new Error("PUBLIC_TRACKING_URL must use HTTP or HTTPS.");
  }

  if (!containerNumber) {
    throw new Error("A container number is required to generate the tracking QR code.");
  }

  trackingURL.searchParams.set("containerNumber", containerNumber);
  return trackingURL.toString();
}

// Generate a QR code that opens the public container-tracking page.
async function generateTrackingQRCode(containerNumber) {
  // Use the configured public URL; never guess a local development port.
  const trackingURL = buildTrackingURL(containerNumber);

  // Generate the QR code as a PNG image buffer.
  const qrCodeBuffer = await QRCode.toBuffer(trackingURL, {
    type: "png",
    errorCorrectionLevel: "H",
    width: 300,
    margin: 2,
  });

  return qrCodeBuffer;
}

export { buildTrackingURL };
export default generateTrackingQRCode;
