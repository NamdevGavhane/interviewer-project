import { jsPDF } from 'jspdf';

/**
 * Generates and downloads a comprehensive, executive-grade PDF Report of the Mock Interview
 * detailing questions asked by evaluator, candidate answers, score breakdown, and feedback.
 * 
 * @param {Object} reportData - Feedback object containing interviewId, candidateId, interviewerId, qaList, scores, strengths, improvements, etc.
 */
export const downloadInterviewReportPDF = (reportData) => {
  try {
    if (!reportData || (reportData.overallScore === undefined && reportData.overallScore === null)) {
      alert('Evaluation feedback has not been submitted yet for this session. A report can only be generated after the evaluator completes their evaluation.');
      return false;
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;

    const interview = reportData.interviewId || {};
    const candidate = reportData.candidateId || {};
    const interviewer = reportData.interviewerId || {};

    const candidateName = candidate.name || 'Candidate';
    const candidateEmail = candidate.email || 'N/A';
    const hrName = interviewer.name || 'Professional Evaluator';
    const hrTitle = interviewer.title || 'Technical Specialist';
    const hrCompany = interviewer.company || 'InterviewPro';

    const topic = interview.topic || reportData.topic || 'Mock Technical Interview';
    const sessionDate = interview.date || reportData.date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const sessionSlot = interview.timeSlot || reportData.timeSlot || 'Scheduled Session';

    const overallScore = Number(reportData.overallScore || 0);
    const technicalScore = reportData.technicalScore !== undefined ? Number(reportData.technicalScore) : overallScore;
    const commScore = reportData.communicationScore !== undefined ? Number(reportData.communicationScore) : overallScore;
    const relevanceScore = reportData.relevanceScore !== undefined ? Number(reportData.relevanceScore) : overallScore;

    const reportId = `RPT-${(reportData._id || (interview._id ? String(interview._id).slice(-6) : Date.now().toString().slice(-6))).toUpperCase()}`;
    const qaList = Array.isArray(reportData.qaList) ? reportData.qaList : [];
    const strengths = Array.isArray(reportData.strengths) ? reportData.strengths : [];
    const improvements = Array.isArray(reportData.improvements) ? reportData.improvements : [];
    const topics = Array.isArray(reportData.suggestedTopics) ? reportData.suggestedTopics : [];
    const detailedNotes = reportData.detailedNotes || 'No additional summary notes provided by the evaluator.';

    const verdict = overallScore >= 85 ? 'STRONG HIRE' : overallScore >= 70 ? 'HIRE / RECOMMENDED' : 'NEEDS PRACTICE';

    let y = 0;

    // Helper: Draw Header Banner on page 1
    const drawHeader = () => {
      doc.setFillColor(26, 115, 232); // Brand Blue
      doc.rect(0, 0, pageWidth, 90, 'F');

      // Decorative Accent Line
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 88, pageWidth, 2, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('InterviewPro', margin, 38);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(224, 238, 255);
      doc.text('1-on-1 Mock Technical & HR Interview Evaluation Report', margin, 54);
      doc.text(`Official Session Assessment  |  Report ID: ${reportId}`, margin, 68);

      // Right Header text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text('CANDIDATE PERFORMANCE DOSSIER', pageWidth - margin, 38, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(224, 238, 255);
      doc.text(`Evaluation Date: ${sessionDate}`, pageWidth - margin, 54, { align: 'right' });
      doc.text(`Status: Completed & Verified`, pageWidth - margin, 68, { align: 'right' });
    };

    drawHeader();
    y = 110;

    // Helper function to check page boundaries and push new page
    const ensureSpace = (neededHeight) => {
      if (y + neededHeight > pageHeight - 50) {
        doc.addPage();
        doc.setFillColor(241, 245, 249);
        doc.rect(0, 0, pageWidth, 35, 'F');
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(`InterviewPro Evaluation Dossier  |  Candidate: ${candidateName}  |  Report ID: ${reportId}`, margin, 22);
        doc.text(`Topic: ${topic}`, pageWidth - margin, 22, { align: 'right' });
        y = 55;
      }
    };

    // 1. Session & Candidate Summary Card
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, 75, 6, 6, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 75, 6, 6, 'D');

    // Candidate Col
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('CANDIDATE INFORMATION', margin + 14, y + 18);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(candidateName, margin + 14, y + 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Email: ${candidateEmail}`, margin + 14, y + 48);
    doc.text(`Target Focus: ${topic}`, margin + 14, y + 62);

    // Evaluator Col
    const midX = margin + contentWidth * 0.45;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('EVALUATOR DETAILS', midX, y + 18);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(hrName, midX, y + 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`${hrTitle} • ${hrCompany}`, midX, y + 48);
    doc.text(`Session Slot: ${sessionSlot}`, midX, y + 62);

    // Verdict Badge
    const rightX = pageWidth - margin - 120;
    const verdictBgColor = overallScore >= 80 ? [220, 252, 231] : overallScore >= 60 ? [254, 243, 199] : [254, 226, 226];
    const verdictTextColor = overallScore >= 80 ? [21, 128, 61] : overallScore >= 60 ? [180, 83, 9] : [185, 28, 28];
    doc.setFillColor(...verdictBgColor);
    doc.roundedRect(rightX, y + 14, 110, 48, 6, 6, 'F');
    doc.setTextColor(...verdictTextColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('FINAL VERDICT', rightX + 55, y + 28, { align: 'center' });
    doc.setFontSize(10);
    doc.text(verdict, rightX + 55, y + 44, { align: 'center' });

    y += 90;

    // 2. Scorecard Grid
    ensureSpace(80);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('EVALUATION SCORECARD BREAKDOWN', margin, y + 12);
    y += 20;

    const scoreCardWidth = (contentWidth - 30) / 4;
    const scores = [
      { label: 'Overall Rating', score: overallScore, color: [26, 115, 232] },
      { label: 'Technical Depth', score: technicalScore, color: [16, 185, 129] },
      { label: 'Communication', score: commScore, color: [139, 92, 246] },
      { label: 'Problem Solving', score: relevanceScore, color: [245, 158, 11] }
    ];

    scores.forEach((s, i) => {
      const cardX = margin + i * (scoreCardWidth + 10);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(cardX, y, scoreCardWidth, 52, 6, 6, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(cardX, y, scoreCardWidth, 52, 6, 6, 'D');

      doc.setTextColor(...s.color);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(`${s.score}%`, cardX + 12, y + 26);

      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(s.label, cardX + 12, y + 42);
    });

    y += 68;

    // 3. Strengths and Improvements
    ensureSpace(120);
    const halfWidth = (contentWidth - 15) / 2;

    // Strengths
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, y, halfWidth, 100, 6, 6, 'F');
    doc.setDrawColor(187, 247, 208);
    doc.roundedRect(margin, y, halfWidth, 100, 6, 6, 'D');

    doc.setTextColor(21, 128, 61);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('KEY STRENGTHS DEMONSTRATED', margin + 12, y + 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    let strY = y + 34;
    if (strengths.length === 0) {
      doc.text('• Evaluator provided no specific strength bullets.', margin + 12, strY);
    } else {
      strengths.slice(0, 4).forEach((s) => {
        const lines = doc.splitTextToSize(`• ${s}`, halfWidth - 24);
        doc.text(lines, margin + 12, strY);
        strY += lines.length * 12 + 2;
      });
    }

    // Improvements
    const impX = margin + halfWidth + 15;
    doc.setFillColor(254, 242, 242);
    doc.roundedRect(impX, y, halfWidth, 100, 6, 6, 'F');
    doc.setDrawColor(254, 202, 202);
    doc.roundedRect(impX, y, halfWidth, 100, 6, 6, 'D');

    doc.setTextColor(185, 28, 28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('AREAS FOR IMPROVEMENT', impX + 12, y + 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    let impY = y + 34;
    if (improvements.length === 0) {
      doc.text('• Evaluator provided no specific improvement bullets.', impX + 12, impY);
    } else {
      improvements.slice(0, 4).forEach((imp) => {
        const lines = doc.splitTextToSize(`• ${imp}`, halfWidth - 24);
        doc.text(lines, impX + 12, impY);
        impY += lines.length * 12 + 2;
      });
    }

    y += 115;

    // 4. Evaluator's Detailed Notes
    ensureSpace(65);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('EVALUATOR SYNTHESIS & EXECUTIVE FEEDBACK', margin, y + 10);
    y += 18;

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, 45, 4, 4, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 45, 4, 4, 'D');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const noteLines = doc.splitTextToSize(detailedNotes, contentWidth - 24);
    doc.text(noteLines, margin + 12, y + 18);
    y += 58;

    // 5. Questions & Candidate Answers Section
    if (qaList.length > 0) {
      ensureSpace(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('DETAILED QUESTION & ANSWER EVALUATION TRANSCRIPT', margin, y + 10);
      y += 24;

      qaList.forEach((item, idx) => {
        ensureSpace(95);

        // Card Box
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(margin, y, contentWidth, 85, 6, 6, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, y, contentWidth, 85, 6, 6, 'D');

        // Question header
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin, y, contentWidth, 22, 6, 6, 'F');
        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`Q${idx + 1}: ${item.question}`, margin + 10, y + 15);

        // Score Pill
        if (item.score !== undefined) {
          doc.setTextColor(26, 115, 232);
          doc.text(`Score: ${item.score}%`, pageWidth - margin - 60, y + 15);
        }

        // Candidate Answer
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Answer:', margin + 10, y + 36);

        doc.setTextColor(51, 65, 85);
        doc.setFont('helvetica', 'normal');
        const ansLines = doc.splitTextToSize(item.candidateAnswer || 'Answer recorded during live evaluation.', contentWidth - 65);
        doc.text(ansLines.slice(0, 2), margin + 55, y + 36);

        // Evaluator Critique
        doc.setTextColor(16, 185, 129);
        doc.setFont('helvetica', 'bold');
        doc.text('Feedback:', margin + 10, y + 62);

        doc.setTextColor(71, 85, 105);
        doc.setFont('helvetica', 'normal');
        const fbkLines = doc.splitTextToSize(item.feedback || 'Evaluated and scored by interviewer.', contentWidth - 65);
        doc.text(fbkLines.slice(0, 2), margin + 55, y + 62);

        y += 95;
      });
    }

    // Footer on final page
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'InterviewPro Official Assessment Report • Confidential Evaluation for Professional Development',
      pageWidth / 2,
      pageHeight - 20,
      { align: 'center' }
    );

    const filename = `Report_${reportId}_${candidateName.replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
    return true;
  } catch (err) {
    console.error('Error generating report PDF:', err);
    alert('Failed to generate report PDF: ' + err.message);
    return false;
  }
};
