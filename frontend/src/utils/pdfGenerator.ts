import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * 生成结构化的PDF评估报告
 * 使用html2canvas将HTML内容转换为图片，解决中文乱码问题
 */
export const generatePDFReport = async (
  result: any,
  teacherId: string,
  reportElement: HTMLElement,
  courseName?: string
) => {
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  
  try {
    // 使用html2canvas将报告元素转换为图片
    const canvas = await html2canvas(reportElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    
    // 计算图片在PDF中的尺寸
    const pdfWidth = pageWidth - 2 * margin;
    const pdfHeight = (imgHeight / imgWidth) * pdfWidth;
    const availableHeight = pageHeight - 2 * margin;
    
    // 如果内容超过一页，需要分页
    if (pdfHeight <= availableHeight) {
      // 内容在一页内，直接添加
      pdf.addImage(imgData, "PNG", margin, margin, pdfWidth, pdfHeight);
    } else {
      // 内容超过一页，使用jsPDF的自动分页功能
      // 计算每页的高度比例
      const totalPages = Math.ceil(pdfHeight / availableHeight);
      const imgHeightPerPage = imgHeight / totalPages;
      
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) {
          pdf.addPage();
        }
        
        const sourceY = page * imgHeightPerPage;
        const sourceHeight = Math.min(imgHeightPerPage, imgHeight - sourceY);
        const destHeight = (sourceHeight / imgHeight) * pdfHeight;
        
        // 创建临时canvas来裁剪当前页的图片
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = imgWidth;
        tempCanvas.height = sourceHeight;
        const tempCtx = tempCanvas.getContext("2d");
        if (tempCtx) {
          tempCtx.drawImage(
            canvas,
            0, sourceY, imgWidth, sourceHeight,
            0, 0, imgWidth, sourceHeight
          );
          const pageImgData = tempCanvas.toDataURL("image/png");
          pdf.addImage(pageImgData, "PNG", margin, margin, pdfWidth, destHeight);
        }
      }
    }
  } catch (error) {
    console.error("PDF生成失败:", error);
    // 如果html2canvas失败，使用文本方式（会有中文乱码，但至少能生成PDF）
    generatePDFFallback(pdf, result, teacherId, courseName);
  }

  // 保存PDF
  const fileName = `智能批课评估报告_${teacherId}_${Date.now()}.pdf`;
  pdf.save(fileName);
};

/**
 * 备用方案：如果html2canvas失败，使用文本方式生成PDF（会有中文乱码）
 */
const generatePDFFallback = (
  pdf: jsPDF,
  result: any,
  teacherId: string,
  courseName?: string
) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let yPos = margin;

  // 封面/报告头部
  pdf.setFontSize(20);
  pdf.setFont("helvetica", "bold");
  pdf.text("Teaching Evaluation Report", pageWidth / 2, yPos, { align: "center" });
  yPos += 15;

  pdf.setFontSize(12);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Teacher ID: ${teacherId}`, margin, yPos);
  if (courseName) {
    pdf.text(`Course: ${courseName}`, margin, yPos + 6);
    yPos += 6;
  }
  pdf.text(
    `Date: ${new Date().toLocaleString("en-US")}`,
    margin,
    yPos + 6
  );
  yPos += 20;

  // 总体评估结果
  pdf.setFontSize(16);
  pdf.setFont("helvetica", "bold");
  pdf.text("1. Overall Evaluation", margin, yPos);
  yPos += 10;

  pdf.setFontSize(12);
  pdf.setFont("helvetica", "normal");
  const overallLevel = result["总体评级"] ?? result.overall_level ?? "--";
  const overallScore = result["总体得分"] ?? result.overall_score ?? "--";
  pdf.text(`Overall Score: ${overallScore}`, margin, yPos);
  yPos += 6;
  pdf.text(`Level: ${overallLevel}`, margin, yPos);
  yPos += 10;

  // 外功能力评估
  if (yPos > pageHeight - 40) {
    pdf.addPage();
    yPos = margin;
  }

  pdf.setFontSize(16);
  pdf.setFont("helvetica", "bold");
  pdf.text("2. Presentation Skills", margin, yPos);
  yPos += 10;

  pdf.setFontSize(12);
  pdf.setFont("helvetica", "normal");
  const presentationScore =
    result["外功综合评分"]?.得分 ??
    result.presentation_score?.score_item?.score ??
    "--";
  pdf.text(`Presentation Score: ${presentationScore}`, margin, yPos);
  yPos += 10;

  // 内功能力评估
  if (yPos > pageHeight - 40) {
    pdf.addPage();
    yPos = margin;
  }

  pdf.setFontSize(16);
  pdf.setFont("helvetica", "bold");
  pdf.text("3. Content Skills", margin, yPos);
  yPos += 10;

  pdf.setFontSize(12);
  pdf.setFont("helvetica", "normal");
  const contentScore =
    result["内功综合评分"]?.得分 ??
    result.content_score?.score_item?.score ??
    "--";
  pdf.text(`Content Score: ${contentScore}`, margin, yPos);
};
