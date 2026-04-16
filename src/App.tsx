/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { FileText, Upload, Loader2, CheckCircle2, AlertCircle, FileSearch, X, Lightbulb, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface ResultItem {
  id: string;
  title: string;
  value: string;
  page: string;
  example: string;
  originalTexts: { page: string; text: string }[];
}

interface ResultCategory {
  categoryName: string;
  items: ResultItem[];
}

interface AnalysisResult {
  categories: ResultCategory[];
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedItem, setSelectedItem] = useState<ResultItem | null>(null);

  const handleExportExcel = () => {
    if (!result) return;

    let fileName = "RFP_분석결과.xlsx";
    if (file) {
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      fileName = `${baseName}_분석결과.xlsx`;
    }

    const data: any[] = [];
    result.categories.forEach(cat => {
      cat.items.forEach(item => {
        const cleanTitle = item.title.replace(/\s*\(.*?\)\s*/g, '');
        const cleanExample = item.example && item.example !== '내용없음' && item.example !== '예시없음'
          ? item.example.replace(/^\d+(-\d+)?\.\s*/, '') 
          : '예시없음';
        const originalTextCombined = item.originalTexts && item.originalTexts.length > 0
          ? item.originalTexts.map(ot => `[${ot.page}] ${ot.text}`).join('\n\n')
          : '내용없음';
        const resultValue = `${item.value} ${item.page && item.page !== '내용없음' ? item.page : ''}`.trim();

        data.push({
          '분석항목': cleanTitle,
          '분석결과': resultValue,
          '작성예시': cleanExample,
          '문서원문 발췌': originalTextCombined
        });
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "분석결과");
    
    // Set column widths for better readability
    const wscols = [
      { wch: 30 }, // 분석항목
      { wch: 50 }, // 분석결과
      { wch: 50 }, // 작성예시
      { wch: 80 }  // 문서원문 발췌
    ];
    worksheet['!cols'] = wscols;

    XLSX.writeFile(workbook, fileName);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type === 'application/pdf' || selectedFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || selectedFile.type === 'text/plain') {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('PDF, Word(docx) 또는 텍스트 파일만 지원합니다.');
      }
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const analyzeRFP = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const base64Data = await readFileAsBase64(file);
      
      const prompt = `너는 입찰전문가야. 첨부된 문서를 분석해서 아래 4개 카테고리내의 항목의 최적의 값을 찾아서 정리하고 해당 근거의 문서 페이지 번호와 원문 내용을 추출해줘.
결과는 반드시 제공된 JSON 스키마 형식에 맞춰 작성해줘.
답변은 핵심만 간결하게 작성하고, 필요한 경우 부연 설명을 덧붙이세요.
항목의 결과값이 여러 개일 경우 목록으로 나열하고, 각각의 결과값에 해당하는 문서 페이지 번호를 모두 표시하세요.
결과값의 근거 페이지는 '(p.X)' 형식으로 표기하세요.
해당하는 내용이 없을 경우 반드시 '내용없음'으로 표시하세요.
값 표현 시에는 문서에서 사용한 문구를 기준으로 그대로 표시하세요.
페이지 번호는 반드시 문서 하단에 표시된 번호를 기준으로 작성하세요.
원문 내용(originalTexts)은 해당 결과값을 도출하게 된 문서 내의 실제 문장이나 단락을 그대로 발췌하되, 발췌한 원문이 위치한 페이지 번호와 함께 배열 형태로 제공해주세요.
작성예시(example)는 아래 '분석할 카테고리 및 항목 리스트'에 '(작성예시: ...)' 형태로 명시된 항목의 경우에만 해당 괄호 안의 문구를 그대로 기재하고, 작성예시가 명시되지 않은 항목은 반드시 '예시없음'으로 처리하세요.
항목명(title) 작성 시 괄호 '()' 안의 설명, 검토 지침 및 작성예시는 모두 제외하고 순수 항목명만 기재하세요.

분석할 카테고리 및 항목 리스트:
< 계약 기본정보 >
1. 사업명
2. 사업금액
3. 수요기관, 담당자, 담당자 연락처
4. 사업기간 (작성예시: 계약체결일로부터 00개월로 명확하게 명시)
4-1. 장기계속 사업
5. 계약방법
6. 계약법 (국가계약법 또는 지방계약법)
7. 국제입찰 여부
8. 긴급입찰 여부 (작성예시: 긴급입찰 사유와 긴급입찰 기간을 명확하게 명시)
8-1. 긴급입찰 사유, 긴급입찰 기간 (8번항목이 긴급입찰인 경우 만 표기)

< 입찰관련 확인사항 >
9. 입찰참가자격 (값이 여러개면 목록으로 정리)
10. 실적제한 지역제한 여부 (실적제한, 지역제한 문구있는지 검토) (작성예시: 협상에의한계약은 기술평가로 전문성, 기술성을 평가하여 업체를 선정하는 방식으로 실적 및 지역으로 입찰참가자격을 제한하는 것을 지양)
11. 공동계약 여부 (작성예시: 공동계약 허용 시 공동계약 방식(공동이행 또는 분담이행) 명시)
11-1. 공동이행방식 (공동이행방식 정리) (작성예시: 공동계약 운용요령 제9조에 따라 5개사로 명시)
11-2. 분담이행 허용여부
12. 하도급 허용여부
13. 중소기업제품 포함여부 (작성예시: 중소기업제품이 포함되어있으면 중소기업자간 경쟁품목을 명확히 명시)
14. 복합사업 여부 (물품구매 내용 있는지 검토) (작성예시: 물품, 공사, 용역사업이 혼재 된 경우 분리발주 검토)

< 제안안내 확인사항 >
15. 계약금액 조정 가능 문구여부 (계약금액 조정 가능 문구있는지 검토) (작성예시: 계약금액 조정가능 문구는 삭제합니다.(??))
16. 하자담보책임기간 및 하자보수보증금율
17. 지체상금율
18. 지식재산권 소유 (지식재산권, 지적재산권 등 소유권이 명시 되어있는지 검토) (작성예시: 용역계약일반조건 제35조의2(계약목적물의 지식재산권 귀속 등) , 제56조 (계약목적물의 지식재산권 귀속 등)에 따라 ‘공동소유‘ 소유로 함을 명시)
19. 개인정보 관련문구 여부 (주민등록번호 숫자 명시, 생년월일 명시 되어있는지 검토) (작성예시: 개인정보보호법 관련하여 주민번호 등은 삭제합니다.(??))
20. 가격 제안서 관련문구 여부 (가격제안서 작성지침 등 관련 문구있는지 검토) (작성예시: 가격제안서 제출은 나라장터를 통한 투찰로 대체되므로, 제안서에 가격제안서를 포함하여 제출하도록 할 수 없음. 관련 부분 삭제)
21. 제안무효 여부 (제안무효, 계약해지, 행정처분, 손해배상, 담합 문구있는지 검토) (작성예시: 무효처리 문구 삭제(??))
21-1. 부적격·감점 등 여부 (부적격(실격) , 감점 문구있는지 검토) (작성예시: 부적격, 감정 등의 관련 문구 삭제합니다.(??))
22. 이의제기 불가여부 (이의제기 불가 문구있는지 검토) (작성예시: 국가계약법 제28조(이의신청) 및 국가계약법 시행령 제110조(이의신청을 할 수 있는 정부조달계약의 최소 금액 기준 등)에 따라 이의신청이 가능하므로 이의제기 불가 문구는 삭제)
23. 수요기관 해석 우선적용 여부 (작성예시: 문구의 해석상 발주처와 의견이 다를 경우 상호협의하여 결정하도록 수정(??))
24. 부당한 특약 여부 (작성예시: 지방계약법 제6조(계약에 원칙) 제3항에 따라 관계 법령에 규정된 계약상 이익을 부당하게 제한하는 특약이나 조건을 정하여서는 아니 되고, 부당한 특약 등은 무효이므로 삭제)
25. 추가제안 여부 (작성예시: 기술력과 관련이 없거나 과업 범위를 구체적으로 명시하지 않은 특별제한, 추가제안, 기타제안 등 요구는 불가하므로 추가제안 관련 문구 모두 삭제)

< 제안서 평가관련 >
26. 평가주체
27. 평가방식 (예시. 온라인 또는 오프라인)
28. 제안서 발표평가
29. 평가배점한도 초과 (각 평가항목의 배점한도는 30점을 초과하는지 검토)
30. 비상대책 수립 평가항목 평가배점 여부 (비상대책 수립 평가항목 문구있는지 검토)
31. 블라인드 평가여부 (블라인드 평가관련 문구있는지 검토) (작성예시: 제안서의 여백, 앞뒤, 표지 등 어느 곳이든 작성 또는 공모 업체 등을 인지할 수 있는 어떠한 표기도 하지 않아야 하며, 인지할 수 있다고 객관적으로 판단되는 특정 표기가 발견될 시 접수는 무효 처리)
32. 차등점수제 명시여부 (차등점수 문구있는지 검토)
33. 참여인력 출신 학력요구 여부 (출신 대학교명, 대학원명 문구있는지 검토) (작성예시: 학벌 아닌 능력중심 사회 만들기 일환으로 출신대학교(또는 대학원) 기재 요구 금지(전공이나 학위 등 기재 가능))
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: file.type,
                  data: base64Data
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              categories: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    categoryName: { type: Type.STRING },
                    items: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          id: { type: Type.STRING },
                          title: { type: Type.STRING },
                          value: { type: Type.STRING },
                          page: { type: Type.STRING },
                          example: { type: Type.STRING },
                          originalTexts: {
                            type: Type.ARRAY,
                            items: {
                              type: Type.OBJECT,
                              properties: {
                                page: { type: Type.STRING },
                                text: { type: Type.STRING }
                              },
                              required: ["page", "text"]
                            }
                          }
                        },
                        required: ["id", "title", "value", "page", "example", "originalTexts"]
                      }
                    }
                  },
                  required: ["categoryName", "items"]
                }
              }
            },
            required: ["categories"]
          }
        }
      });

      const jsonStr = response.text.trim();
      const parsedResult = JSON.parse(jsonStr) as AnalysisResult;
      setResult(parsedResult);
    } catch (err: any) {
      console.error(err);
      setError('분석 중 오류가 발생했습니다. 파일 형식이 올바른지 확인해주세요.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf' || droppedFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || droppedFile.type === 'text/plain') {
        setFile(droppedFile);
        setError(null);
      } else {
        setError('PDF, Word(docx) 또는 텍스트 파일만 지원합니다.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#333] font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <FileSearch className="text-white w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">일반용역 RFP AI사전검토 서비스</h1>
            <p className="text-sm text-gray-500">협상에 의한 계약 제안요청서 자동 분석(by KKY)</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Input Section */}
          <section className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" />
                파일 업로드
              </h2>
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`
                  border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                  ${file ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}
                `}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                  accept=".pdf,.docx,.txt"
                />
                <div className="flex flex-col items-center gap-3">
                  {file ? (
                    <>
                      <FileText className="w-12 h-12 text-blue-600" />
                      <div className="text-sm font-medium text-gray-700 truncate max-w-full">
                        {file.name}
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setFile(null); }}
                        className="text-xs text-red-500 hover:underline"
                      >
                        파일 삭제
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 text-gray-400" />
                      <p className="text-sm text-gray-500">
                        클릭하거나 파일을 드래그하여 업로드하세요
                      </p>
                      <p className="text-xs text-gray-400">PDF, DOCX, TXT 지원</p>
                    </>
                  )}
                </div>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={analyzeRFP}
                disabled={!file || isAnalyzing}
                className={`
                  w-full mt-6 py-3 px-4 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2
                  ${!file || isAnalyzing ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200'}
                `}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    분석 중...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    분석 시작
                  </>
                )}
              </button>
            </div>

            <div className="bg-blue-50 rounded-2xl p-6 border border-blue-100">
              <h3 className="text-sm font-bold text-blue-800 mb-2 uppercase tracking-wider">안내사항</h3>
              <ul className="text-xs text-blue-700 space-y-2 list-disc pl-4">
                <li>조달청 협상에 의한 계약 제안요청서 분석에 최적화되어 있습니다.</li>
                <li>AI 분석 결과는 참고용이며, 실제 제안요청서를 반드시 확인하시기 바랍니다.</li>
                <li>문서의 가독성에 따라 분석 결과의 정확도가 달라질 수 있습니다.</li>
              </ul>
            </div>
          </section>

          {/* Result Section */}
          <section className="lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 h-full min-h-[600px] flex flex-col">
              <div className="p-6 border-bottom border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    분석 결과
                  </h2>
                  {result && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                      분석 완료
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {result && (
                    <>
                      <button 
                        onClick={() => {
                          setResult(null);
                          setFile(null);
                        }}
                        className="text-xs bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg font-medium transition-colors"
                      >
                        초기화
                      </button>
                      <button 
                        onClick={handleExportExcel}
                        className="text-xs bg-green-50 border border-green-200 hover:bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 relative"
                      >
                        <Download className="w-3.5 h-3.5" />
                        엑셀 내보내기
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex-1 p-6 overflow-auto">
                <AnimatePresence mode="wait">
                  {isAnalyzing ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4"
                    >
                      <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
                      <div className="text-center">
                        <p className="text-lg font-medium text-gray-600">제안요청서를 정밀 분석하고 있습니다</p>
                        <p className="text-sm">잠시만 기다려 주세요 (약 20~40초 소요)</p>
                      </div>
                    </motion.div>
                  ) : result ? (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      {result.categories.map((category, idx) => (
                        <div key={idx} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                            <h3 className="font-bold text-gray-800 text-sm">{category.categoryName}</h3>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {category.items.map((item, itemIdx) => (
                              <div 
                                key={itemIdx} 
                                onClick={() => setSelectedItem(item)}
                                className="p-3 hover:bg-blue-50/50 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3 group"
                              >
                                <div className="sm:w-1/3 font-medium text-gray-700 flex items-start gap-2">
                                  <span className="text-blue-500 text-xs mt-0.5 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 whitespace-nowrap">{item.id}</span>
                                  <span className="text-sm leading-tight mt-0.5">{item.title.replace(/\s*\(.*?\)\s*/g, '')}</span>
                                </div>
                                <div className="sm:w-2/3 flex flex-col gap-1">
                                  <div className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
                                    {item.value}
                                    {item.page && item.page !== '내용없음' && (
                                      <span className="ml-2 text-xs text-blue-600 font-mono bg-blue-50 px-1.5 py-0.5 rounded inline-block align-middle">{item.page}</span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 flex items-center gap-1 font-medium">
                                    <FileSearch className="w-3 h-3" /> {item.example && item.example !== '내용없음' && item.example !== '예시없음' ? '작성예시 / 원문 보기' : '원문 보기'}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                      <FileSearch className="w-16 h-16 opacity-20" />
                      <p className="text-gray-500">왼쪽에서 파일을 업로드하고 분석을 시작하세요</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </section>
        </div>
      </div>
      
      {/* Modal */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedItem(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-100"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
                <h3 className="font-bold text-gray-900 flex items-center gap-2.5">
                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-sm border border-blue-200">{selectedItem.id}</span>
                  {selectedItem.title}
                </h3>
                <button onClick={() => setSelectedItem(null)} className="text-gray-400 hover:text-gray-700 hover:bg-gray-200 p-1.5 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1 bg-white space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> 분석 결과
                  </h4>
                  <div className="text-sm text-gray-900 bg-blue-50/50 p-4 rounded-xl border border-blue-100 whitespace-pre-wrap leading-relaxed">
                    {selectedItem.value}
                    {selectedItem.page && selectedItem.page !== '내용없음' && (
                      <span className="ml-2 inline-block text-xs text-blue-700 font-mono bg-blue-100/50 px-2 py-0.5 rounded border border-blue-200 align-middle">{selectedItem.page}</span>
                    )}
                  </div>
                </div>
                {selectedItem.example && selectedItem.example !== '내용없음' && selectedItem.example !== '예시없음' && (
                  <div>
                    <h4 className="text-xs font-bold text-green-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Lightbulb className="w-4 h-4" /> 작성 예시
                    </h4>
                    <div className="text-sm text-gray-800 bg-green-50/50 p-4 rounded-xl border border-green-100 whitespace-pre-wrap leading-relaxed">
                      {selectedItem.example.replace(/^\d+(-\d+)?\.\s*/, '')}
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FileText className="w-4 h-4" /> 문서 원문 발췌
                  </h4>
                  {selectedItem.originalTexts && selectedItem.originalTexts.length > 0 ? (
                    <div className="space-y-3">
                      {selectedItem.originalTexts.map((ot, idx) => (
                        <div key={idx} className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                          <div className="inline-block text-xs font-bold text-blue-700 bg-blue-100/50 px-2 py-1 rounded border border-blue-200 mb-2">
                            {ot.page}
                          </div>
                          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-serif">
                            {ot.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-700 bg-gray-50 p-5 rounded-xl border border-gray-200 whitespace-pre-wrap leading-relaxed font-serif">
                      해당 항목에 대한 명시적인 원문 내용을 찾을 수 없습니다.
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/80 flex justify-end">
                <button 
                  onClick={() => setSelectedItem(null)}
                  className="px-5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-sm"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="mt-12 text-center text-gray-400 text-xs pb-8">
        © 2026 일반용역 RFP AI사전검토 서비스. Powered by Gemini AI.
      </footer>
    </div>
  );
}
