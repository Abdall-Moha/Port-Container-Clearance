
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
    ]) || String(billOfLading?._id || "Not available");

  const importerName =
    getFirstValue(importer, [
      "fullName",
      "name",
    ]) || "Not available";

  const paymentReceipt =
    getFirstValue(payment, [
      "receiptNumber",
      "receipt",
      "transactionId",
      "transactionReference",
      "paymentReference",
      "reference",
    ]) || String(payment._id || "Not available");

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
    // PDF heading.
    document
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("CONTAINER RELEASE ORDER", {
        align: "center",
      });

    document.moveDown(0.5);

    document
      .fontSize(10)
      .font("Helvetica")
      .text("Port Container Clearance Tracker", {
        align: "center",
      });

    document.moveDown(2);

    // Release Order information.
    document
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("RELEASE ORDER DETAILS");

    document.moveDown(0.7);

    document
      .fontSize(10)
      .font("Helvetica");

    const details = [
      ["Release Order ID", String(releaseOrder._id)],
      ["Container Number", container.containerNumber],
      ["Bill of Lading", billOfLadingNumber],
      ["Importer", importerName],
      ["Payment Receipt", paymentReceipt],
      ["Release Date", formatDate(releaseOrder.createdAt)],
      ["Customs Officer", officerName],
      ["Gate Code", releaseOrder.gateCode],
    ];

    for (const [label, value] of details) {
      document
        .font("Helvetica-Bold")
        .text(`${label}: `, {
          continued: true,
        });

      document
        .font("Helvetica")
        .text(String(value || "Not available"));
    }

    document.moveDown(2);

    // Add the public tracking QR code.
    document
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("PUBLIC CONTAINER TRACKING");

    document.moveDown(0.5);

    document.image(qrCodeBuffer, {
      width: 150,
      height: 150,
      align: "center",
    });

    document.moveDown(0.5);

    document
      .fontSize(9)
      .font("Helvetica")
      .text(
        "Scan this QR code to view the public container tracking information.",
        {
          align: "center",
        },
      );

    document.moveDown(2);

    // Add a notice about the Gate Code.
    document
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(
        "IMPORTANT: Keep the Gate Code secure. It is required for container collection.",
        {
          align: "center",
        },
      );

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
