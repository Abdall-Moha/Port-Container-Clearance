
import PDFDocument from "pdfkit";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";

import generateTrackingQRCode from "./QRCodeService.js";

// Get the first available value from an object using possible field names.
function getFirstValue(object, fields) {
  if (!object) return "";

  for (const field of fields) {
    const value = object[field];

    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  }

  return "";
}

// Format a date for the PDF.
function formatDate(date) {
  if (!date) return "Not available";

  return new Date(date).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Generate and save the Release Order PDF.
async function generateReleaseOrderPDF({
  releaseOrder,
  container,
  payment,
}) {
  // Make sure the required information is available.
  if (!releaseOrder || !container || !payment) {
    throw new Error(
      "Release Order, Container, and Payment information are required.",
    );
  }

  // Create the directory if it does not already exist.
  const uploadDirectory = path.join(
    process.cwd(),
    "uploads",
    "release-orders",
  );

  await fs.mkdir(uploadDirectory, {
    recursive: true,
  });

  // Create a unique PDF filename.
  const fileName = `release-order-${releaseOrder._id}.pdf`;

  const filePath = path.join(
    uploadDirectory,
    fileName,
  );

  // Generate the QR code for the public tracking page.
  const qrCodeBuffer = await generateTrackingQRCode(
    container.containerNumber,
  );

  // Extract information from the related documents.
  // These possible field names allow the PDF to work with different schema naming conventions.
  const billOfLading =
    container.billOfLading;

  const importer =
    container.importer;

  const releasedBy =
    releaseOrder.releasedBy;

  const billOfLadingNumber =
    getFirstValue(billOfLading, [
      "billOfLadingNumber",
      "blNumber",
      "billNumber",
      "number",
      "documentNumber",
    ]) || "Not available";

  const importerName =
    getFirstValue(importer, [
      "fullName",
      "name",
    ]) || "Not available";

  const paymentReceipt =
    getFirstValue(payment, [
      "receiptNumber",
      "receipt",
    ]) || "Not available";

  const officerName =
    getFirstValue(releasedBy, [
      "fullName",
      "name",
    ]) || "Not available";

  // Create the PDF document.
  const document = new PDFDocument({
    size: "A4",
    margin: 50,
    info: {
      Title: "Port Container Release Order",
      Author: "Port Container Clearance Tracker",
    },
  });

  // Create a writable stream for the PDF file.
 const writeStream = createWriteStream(filePath);

  // Wait until the PDF has been completely written.
  const pdfFinished = new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);

    writeStream.on("error", reject);

    document.on("error", reject);
  });

  document.pipe(writeStream);

  try {
    // Add a high-contrast header suitable for on-screen viewing and printing.
    document.rect(50, 50, 495, 86).fill("#172554");
    document.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(19)
      .text("CONTAINER RELEASE ORDER", 70, 72, { align: "center", width: 455 });
    document.fillColor("#DCE7FF").font("Helvetica").fontSize(10)
      .text("Port Container Clearance Tracker", 70, 105, { align: "center", width: 455 });

    // Print the shipment, payment, and officer details from their saved records.
    document.fillColor("#172554").font("Helvetica-Bold").fontSize(12)
      .text("RELEASE ORDER DETAILS", 58, 158);
    const details = [
      ["Release Order ID", String(releaseOrder._id)],
      ["Container Number", container.containerNumber],
      ["Bill of Lading Number", billOfLadingNumber],
      ["Importer Name", importerName],
      ["Duty Receipt Number", paymentReceipt],
      ["Release Date", formatDate(releaseOrder.createdAt)],
      ["Customs Officer", officerName],
    ];

    let rowTop = 184;
    for (const [index, [label, value]] of details.entries()) {
      if (index % 2 === 0) document.rect(55, rowTop, 485, 31).fill("#F1F5F9");
      document.fillColor("#475569").font("Helvetica-Bold").fontSize(9)
        .text(label, 67, rowTop + 10, { width: 165 });
      document.fillColor("#172554").font("Helvetica").fontSize(10)
        .text(String(value || "Not available"), 235, rowTop + 9, { width: 290 });
      rowTop += 34;
    }

    // Highlight the six-digit Gate Code while keeping it inside the protected PDF.
    document.roundedRect(55, 435, 485, 58, 8).fill("#EFF6FF");
    document.fillColor("#2B4593").font("Helvetica-Bold").fontSize(10)
      .text("GATE CODE", 72, 450);
    document.fillColor("#172554").font("Helvetica-Bold").fontSize(23)
      .text(String(releaseOrder.gateCode || "Not available"), 205, 447, { align: "center", width: 185 });

    // Include the tracking QR generated from the configured public tracking URL.
    document.fillColor("#172554").font("Helvetica-Bold").fontSize(11)
      .text("PUBLIC CONTAINER TRACKING", 55, 514, { align: "center", width: 485 });
    document.image(qrCodeBuffer, { x: 230, y: 535, width: 145, height: 145 });
    document.fillColor("#64748B").font("Helvetica").fontSize(9)
      .text("Scan to view this container's public clearance progress.", 70, 690, { align: "center", width: 455 });
    document.fillColor("#9F1239").font("Helvetica-Bold").fontSize(9)
      .text("Keep the Gate Code secure. It is required for container collection.", 70, 725, { align: "center", width: 455 });

    // Finish generating the PDF.
    document.end();

    await pdfFinished;

    // Store a relative path in MongoDB.
    return path.join(
      "uploads",
      "release-orders",
      fileName,
    );
  } catch (error) {
    // Remove an incomplete PDF if generation fails.
    await fs.unlink(filePath).catch(() => {});

    throw error;
  }
}

// Get the absolute file path for a saved Release Order PDF.
function getReleaseOrderPDFPath(pdfPath) {
  return path.resolve(process.cwd(), pdfPath);
}

export {
  generateReleaseOrderPDF,
  getReleaseOrderPDFPath,
};
