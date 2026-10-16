import { jsPDF } from 'jspdf';

/**
 * Generates and downloads a professional PDF Tax Invoice / Payment Receipt
 * @param {Object} paymentData
 */
export const downloadInvoicePDF = (paymentData) => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;

    const invoiceNo = paymentData.invoiceNumber || `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const paymentId = paymentData.paymentId || `pay_${Date.now().toString().slice(-8)}`;
    const orderId = paymentData.orderId || `order_${Date.now().toString().slice(-8)}`;
    const paymentDate = paymentData.date || new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    const candidateName = paymentData.candidateName || paymentData.candidateId?.name || 'Candidate';
    const candidateEmail = paymentData.candidateEmail || paymentData.candidateId?.email || 'N/A';
    
    const interviewerName = paymentData.interviewerName || paymentData.interviewerId?.name || 'Senior Technical Lead';
    const interviewerTitle = paymentData.interviewerTitle || paymentData.interviewerId?.title || 'Technical Specialist';
    const company = paymentData.company || paymentData.interviewerId?.company || 'InterviewPro Expert';

    const topic = paymentData.topic || 'Technical Mock Interview & System Coding';
    const timeSlot = paymentData.timeSlot || 'Scheduled Session';
    const sessionFee = Number(paymentData.sessionFee || paymentData.price || 100);
    const platformFee = Number(paymentData.platformFee || Math.round(sessionFee * 0.1));
    const totalAmount = Number(paymentData.amount || paymentData.paidAmount || (sessionFee + platformFee));
    const paymentMethod = (paymentData.paymentMethod || 'UPI / Razorpay').toUpperCase();

    // 1. Header Banner
    doc.setFillColor(26, 115, 232); // Primary Brand Blue
    doc.rect(0, 0, pageWidth, 90, 'F');

    // Brand Title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('InterviewPro', margin, 42);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('1-on-1 Mock Technical Preparation Platform', margin, 58);
    doc.text('support@interviewpro.com | https://interviewpro.dev', margin, 72);

    // Right side Header text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('TAX INVOICE & RECEIPT', pageWidth - margin, 42, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Invoice #: ${invoiceNo}`, pageWidth - margin, 58, { align: 'right' });
    doc.text(`Date: ${paymentDate}`, pageWidth - margin, 72, { align: 'right' });

    let y = 120;

    // 2. Status Badge
    doc.setFillColor(230, 244, 234); // Light green
    doc.roundedRect(margin, y - 14, 130, 24, 4, 4, 'F');
    doc.setTextColor(19, 115, 51); // Dark green
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('● PAYMENT VERIFIED', margin + 12, y + 2);

    // Transaction Details pill
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Payment ID: ${paymentId}`, pageWidth - margin, y - 2, { align: 'right' });
    doc.text(`Order ID: ${orderId}  |  Method: ${paymentMethod}`, pageWidth - margin, y + 10, { align: 'right' });

    y += 35;

    // 3. Billing Info Cards (Two columns)
    const colWidth = (contentWidth - 20) / 2;

    // Card 1: Billed To (Candidate)
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, colWidth, 90, 6, 6, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, colWidth, 90, 6, 6, 'D');

    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('BILLED TO (CANDIDATE)', margin + 14, y + 18);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.text(candidateName, margin + 14, y + 36);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Email: ${candidateEmail}`, margin + 14, y + 52);
    doc.text(`Platform Role: Technical Candidate`, margin + 14, y + 66);
    doc.text(`Status: Verified Account`, margin + 14, y + 80);

    // Card 2: Interviewer & Session Info
    const rightColX = margin + colWidth + 20;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(rightColX, y, colWidth, 90, 6, 6, 'F');
    doc.roundedRect(rightColX, y, colWidth, 90, 6, 6, 'D');

    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('INTERVIEWER & SERVICE PROVIDER', rightColX + 14, y + 18);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.text(interviewerName, rightColX + 14, y + 36);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Designation: ${interviewerTitle}`, rightColX + 14, y + 52);
    doc.text(`Organization: ${company}`, rightColX + 14, y + 66);
    doc.text(`Slot: ${timeSlot}`, rightColX + 14, y + 80);

    y += 115;

    // 4. Session Highlights Banner
    doc.setFillColor(238, 242, 255); // Indigo tinted
    doc.roundedRect(margin, y, contentWidth, 36, 4, 4, 'F');
    doc.setTextColor(67, 56, 202);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Topic Focus:', margin + 12, y + 22);
    doc.setFont('helvetica', 'normal');
    doc.text(topic, margin + 85, y + 22);

    y += 55;

    // 5. Line Items Table
    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 24, 'F');
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('ITEM DESCRIPTION', margin + 10, y + 16);
    doc.text('DURATION / TYPE', margin + 280, y + 16);
    doc.text('AMOUNT (INR)', pageWidth - margin - 10, y + 16, { align: 'right' });

    y += 24;

    // Row 1: Session Fee
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 30, pageWidth - margin, y + 30);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('1-on-1 Live Mock Interview Session', margin + 10, y + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Conducted by ${interviewerName} (${company})`, margin + 10, y + 26);

    doc.setTextColor(71, 85, 105);
    doc.setFontSize(9);
    doc.text('45 Minutes Live Call', margin + 280, y + 20);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`INR ${sessionFee.toFixed(2)}`, pageWidth - margin - 10, y + 20, { align: 'right' });

    y += 38;

    // Row 2: Platform & Video Room Fee
    doc.line(margin, y + 30, pageWidth - margin, y + 30);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Platform Maintenance, WebRTC Video & AI Engine', margin + 10, y + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Secure Room creation, Evaluation Report & Storage', margin + 10, y + 26);

    doc.setTextColor(71, 85, 105);
    doc.setFontSize(9);
    doc.text('10% Platform Charge', margin + 280, y + 20);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`INR ${platformFee.toFixed(2)}`, pageWidth - margin - 10, y + 20, { align: 'right' });

    y += 45;

    // 6. Subtotal & Total Summary Box
    const summaryBoxX = pageWidth - margin - 220;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(summaryBoxX, y, 220, 85, 6, 6, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(summaryBoxX, y, 220, 85, 6, 6, 'D');

    let sumY = y + 20;
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Subtotal:', summaryBoxX + 14, sumY);
    doc.setTextColor(15, 23, 42);
    doc.text(`INR ${(sessionFee + platformFee).toFixed(2)}`, summaryBoxX + 206, sumY, { align: 'right' });

    sumY += 18;
    doc.setTextColor(100, 116, 139);
    doc.text('GST / Taxes (18% Incl.):', summaryBoxX + 14, sumY);
    const gstAmount = ((totalAmount * 18) / 118).toFixed(2);
    doc.setTextColor(15, 23, 42);
    doc.text(`INR ${gstAmount}`, summaryBoxX + 206, sumY, { align: 'right' });

    sumY += 12;
    doc.setDrawColor(203, 213, 225);
    doc.line(summaryBoxX + 10, sumY, summaryBoxX + 210, sumY);

    sumY += 18;
    doc.setTextColor(26, 115, 232);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Total Paid:', summaryBoxX + 14, sumY);
    doc.text(`INR ${totalAmount.toFixed(2)}`, summaryBoxX + 206, sumY, { align: 'right' });

    // Left side: Security & Terms
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Payment Gateway: Razorpay Verified / UPI Direct Secure Pay', margin, y + 20);
    doc.text('PCI-DSS Level 1 Compliant Transaction Processing', margin, y + 32);
    doc.text('Session Guarantee: If the session is interrupted or cancelled,', margin, y + 44);
    doc.text('a full 100% refund is issued to your original payment method.', margin, y + 56);
    doc.text('Questions? Contact us 24x7 at billing@interviewpro.dev', margin, y + 68);

    y += 120;

    // 7. Electronic Signature / Stamp
    doc.setDrawColor(26, 115, 232);
    doc.setLineWidth(1);
    doc.roundedRect(margin, y, 180, 48, 4, 4, 'D');
    doc.setTextColor(26, 115, 232);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('INTERVIEWPRO DIGITAL SEAL', margin + 12, y + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Verified Authorization & Digital Hash', margin + 12, y + 30);
    doc.text(`Auth Code: ${paymentId.toUpperCase()}`, margin + 12, y + 40);

    // Footer note
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'This is an authorized computer-generated Tax Invoice and requires no physical signature.',
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 25,
      { align: 'center' }
    );

    // Save and download
    const filename = `Invoice_${invoiceNo}_${candidateName.replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
    return true;
  } catch (err) {
    console.error('Error generating invoice PDF:', err);
    alert('Failed to generate PDF: ' + err.message);
    return false;
  }
};
