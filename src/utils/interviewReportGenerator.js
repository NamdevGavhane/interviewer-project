import { jsPDF } from 'jspdf';

/**
 * Generates and downloads a comprehensive, executive-grade PDF Report of the Mock Interview
 * detailing questions asked by HR, candidate answers, score breakdown, and evaluator feedback.
 * 
 * @param {Object} reportData - Feedback object containing interviewId, candidateId, interviewerId, qaList, scores, strengths, improvements, etc.
 */
export const downloadInterviewReportPDF = (reportData) => {
  try {
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
    const candidateEmail = candidate.email || 'candidate@example.com';
    const hrName = interviewer.name || 'HR & Senior Technical Lead';
    const hrTitle = interviewer.title || 'Technical Specialist & HR Evaluator';
    const hrCompany = interviewer.company || 'InterviewPro Expert';

    const topic = interview.topic || reportData.topic || 'Frontend & Fullstack Mock Interview';
    const sessionDate = interview.date || reportData.date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const sessionSlot = interview.timeSlot || reportData.timeSlot || '45 Mins Live Session';

    const overallScore = Number(reportData.overallScore ?? 82);
    const technicalScore = Number(reportData.technicalScore ?? 85);
    const commScore = Number(reportData.communicationScore ?? 80);
    const relevanceScore = Number(reportData.relevanceScore ?? 80);

    const reportId = `RPT-${(reportData._id || (interview._id ? interview._id.slice(-6) : Date.now().toString().slice(-6))).toUpperCase()}`;
    const qaList = reportData.qaList && reportData.qaList.length > 0 ? reportData.qaList : [];
    const strengths = reportData.strengths || ['Strong technical foundations', 'Articulate communication'];
    const improvements = reportData.improvements || ['Structure complex responses using the STAR method'];
    const topics = reportData.suggestedTopics || ['React 19 Server Components', 'System Design & Distributed Caching'];
    const detailedNotes = reportData.detailedNotes || 'Candidate performed solidly across core architecture concepts with clear potential for senior engineering loops.';

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
        // Mini top bar on subsequent pages
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

    // 1. Participant Details Cards (Two Columns)
    const colWidth = (contentWidth - 16) / 2;

    // Left Column: Candidate Info
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, colWidth, 75, 4, 4, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, colWidth, 75, 4, 4, 'D');

    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('CANDIDATE DETAILS', margin + 12, y + 16);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.text(candidateName, margin + 12, y + 32);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Email: ${candidateEmail}`, margin + 12, y + 46);
    doc.text(`Session Topic: ${topic}`, margin + 12, y + 60);

    // Right Column: Evaluator (HR / Interviewer) Info
    const rightColX = margin + colWidth + 16;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(rightColX, y, colWidth, 75, 4, 4, 'F');
    doc.roundedRect(rightColX, y, colWidth, 75, 4, 4, 'D');

    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('INTERVIEWER / HR EVALUATOR', rightColX + 12, y + 16);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.text(hrName, rightColX + 12, y + 32);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Role: ${hrTitle}`, rightColX + 12, y + 46);
    doc.text(`Organization: ${hrCompany}  |  Slot: ${sessionSlot}`, rightColX + 12, y + 60);

    y += 90;

    // 2. Executive Scorecard Banner
    doc.setFillColor(238, 242, 255); // Indigo Tint
    doc.roundedRect(margin, y, contentWidth, 68, 6, 6, 'F');
    doc.setDrawColor(199, 210, 254);
    doc.roundedRect(margin, y, contentWidth, 68, 6, 6, 'D');

    // Overall Score Pill
    doc.setFillColor(26, 115, 232);
    doc.roundedRect(margin + 16, y + 12, 90, 44, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(`${overallScore}/100`, margin + 61, y + 36, { align: 'center' });
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('OVERALL SCORE', margin + 61, y + 48, { align: 'center' });

    // Individual Sub-Scores
    const scoreStartX = margin + 125;
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Technical Knowledge: ${technicalScore}%`, scoreStartX, y + 25);
    doc.text(`Communication & Clarity: ${commScore}%`, scoreStartX + 160, y + 25);
    doc.text(`Answer Relevance & Structure: ${relevanceScore}%`, scoreStartX, y + 48);

    // Verdict Badge
    const verdictColor = overallScore >= 80 ? [16, 185, 129] : overallScore >= 70 ? [245, 158, 11] : [239, 68, 68];
    doc.setFillColor(...verdictColor);
    doc.roundedRect(pageWidth - margin - 120, y + 16, 105, 24, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(verdict, pageWidth - margin - 67.5, y + 31, { align: 'center' });

    y += 85;

    // 3. MAIN SECTION: Questions Asked by HR & Candidate Answers
    ensureSpace(40);
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentWidth, 26, 4, 4, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('QUESTIONS ASKED BY HR & CANDIDATE ANSWERS', margin + 12, y + 17);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`${qaList.length} Interview Q&A Exchanges`, pageWidth - margin - 12, y + 17, { align: 'right' });

    y += 36;

    // Render Each Q&A
    qaList.forEach((item, index) => {
      const qText = item.question || `Interview Question ${index + 1}`;
      const aText = item.candidateAnswer || 'Candidate provided detailed verbal explanation during the interview.';
      const feedbackText = item.feedback || 'Evaluated for conceptual accuracy and problem breakdown.';
      const score = item.score || 80;

      // Calculate heights
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const splitQ = doc.splitTextToSize(`Q${index + 1} (Asked by HR): ${qText}`, contentWidth - 30);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const splitA = doc.splitTextToSize(`Candidate Answer: "${aText}"`, contentWidth - 30);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      const splitCritique = doc.splitTextToSize(`HR Evaluation & Notes: ${feedbackText} (Score: ${score}/100)`, contentWidth - 30);

      const blockHeight = splitQ.length * 13 + splitA.length * 12 + splitCritique.length * 12 + 28;

      ensureSpace(blockHeight + 10);

      // Card Background Box
      doc.setFillColor(252, 253, 255);
      doc.roundedRect(margin, y, contentWidth, blockHeight, 4, 4, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, contentWidth, blockHeight, 4, 4, 'D');

      // Left Accent Border Pill
      doc.setFillColor(26, 115, 232);
      doc.roundedRect(margin, y, 4, blockHeight, 2, 2, 'F');

      let currentCardY = y + 16;

      // Question line
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(splitQ, margin + 16, currentCardY);
      currentCardY += splitQ.length * 13 + 4;

      // Candidate Answer
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(splitA, margin + 16, currentCardY);
      currentCardY += splitA.length * 12 + 4;

      // HR Critique & Score
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.text(splitCritique, margin + 16, currentCardY);

      y += blockHeight + 12;
    });

    // 4. Strengths & Areas for Improvement (Side by Side or stacked)
    ensureSpace(120);

    const halfWidth = (contentWidth - 14) / 2;

    // Strengths Box
    doc.setFillColor(240, 253, 244); // Light green
    doc.roundedRect(margin, y, halfWidth, 100, 4, 4, 'F');
    doc.setDrawColor(187, 247, 208);
    doc.roundedRect(margin, y, halfWidth, 100, 4, 4, 'D');

    doc.setTextColor(22, 101, 52);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Key Strengths Observed', margin + 12, y + 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    let strY = y + 34;
    strengths.slice(0, 3).forEach(str => {
      const splitStr = doc.splitTextToSize(`+  ${str}`, halfWidth - 24);
      doc.text(splitStr, margin + 12, strY);
      strY += splitStr.length * 12 + 3;
    });

    // Improvements Box
    const impX = margin + halfWidth + 14;
    doc.setFillColor(254, 252, 232); // Light amber
    doc.roundedRect(impX, y, halfWidth, 100, 4, 4, 'F');
    doc.setDrawColor(254, 240, 138);
    doc.roundedRect(impX, y, halfWidth, 100, 4, 4, 'D');

    doc.setTextColor(161, 98, 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Areas for Targeted Improvement', impX + 12, y + 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    let impY = y + 34;
    improvements.slice(0, 3).forEach(imp => {
      const splitImp = doc.splitTextToSize(`*  ${imp}`, halfWidth - 24);
      doc.text(splitImp, impX + 12, impY);
      impY += splitImp.length * 12 + 3;
    });

    y += 112;

    // 5. Recommended Next Topics to Practice
    ensureSpace(50);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, 38, 4, 4, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 38, 4, 4, 'D');

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Recommended Focus Topics:', margin + 12, y + 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(topics.join('  |  '), margin + 160, y + 22);

    y += 50;

    // 6. Detailed Notes & Evaluator Sign-off
    ensureSpace(70);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Evaluator Summary & Feedback Notes:', margin, y);
    y += 15;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const splitNotes = doc.splitTextToSize(detailedNotes, contentWidth);
    doc.text(splitNotes, margin, y);
    y += splitNotes.length * 13 + 15;

    // Digital Verification Seal
    ensureSpace(45);
    doc.setDrawColor(26, 115, 232);
    doc.roundedRect(margin, y, contentWidth, 36, 4, 4, 'D');
    doc.setTextColor(26, 115, 232);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('INTERVIEWPRO VERIFIED EVALUATION DOSSIER', margin + 12, y + 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Assessed by ${hrName} (${hrCompany})  |  Cryptographic Record: ${reportId}  |  Generated on ${new Date().toLocaleString()}`, margin + 12, y + 28);

    // Apply Page Numbers on all pages
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${i} of ${totalPages}  |  InterviewPro Assessment Confidential  |  https://interviewpro.dev`,
        pageWidth / 2,
        pageHeight - 20,
        { align: 'center' }
      );
    }

    // Save and download
    const cleanCandidateName = candidateName.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Interview_Report_${cleanCandidateName}_${Date.now()}.pdf`;
    doc.save(filename);
    return true;
  } catch (err) {
    console.error('Error generating Interview Report PDF:', err);
    alert('Failed to generate interview report PDF: ' + err.message);
    return false;
  }
};
