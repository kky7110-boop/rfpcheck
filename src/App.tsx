/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { FileText, Upload, Loader2, CheckCircle2, AlertCircle, FileSearch, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showCopied, setShowCopied] = useState(false);

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    }
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
      
      const prompt = `너는 입찰전문가야. 첨부된 문서를 분석해서 아래 4개 카테고리내의 항목의 최적의 값을 찾아서 정리하고 해당 근거의 문서 페이지 번호를 가장 정확한 하나만 표시해줘.
결과는 반드시 아래 형식을 유지해줘.
출력 시 별표(*)나 마크다운 강조 기호(**) 등 불필요한 특수 문자는 절대 사용하지 마세요.
답변은 개조식으로 핵심만 간결하게 작성하고, 필요한 경우 부연 설명을 덧붙이세요.
값 표현 시에는 문서에서 사용한 문구를 기준으로 그대로 표시하세요.
페이지 번호는 반드시 문서 하단에 표시된 번호를 기준으로 작성하세요.

< 계약 기본정보 >
 - 사업명 :
 - 사업금액 :
    ※ 제안요청 설명회 개최여부 : (사업금액 20억 이상일 경우)
 - 사업기간 :
 - 장기계속 사업 :
 - 계약방법 :
 - 계약법 : (국가계약법 또는 지방계약법)
 - 국제입찰 :
 - 긴급입찰 :
    ※ 긴급입찰사유 및 공고기간 : (긴급입찰일 경우)
 - AI 사업 :
 - 국정과제 사업 :

< 입찰관련 확인사항 >
 - 입찰참가자격 : (값이 여러개면 목록으로 정리해줘)
 - 대기업 참여제한에 대한 예외인정사업 :
 - 공동계약 여부 :
 - 분담이행 허용여부 :
 - 하도급 허용여부 :
 - 중소기업제품 포함여부 :
 - 개인정보영향평가 포함여부 :
 - SW분리발주 여부 (상용SW 포함 시) :

< 제안안내 확인사항 >
 - 적정 사업기간의 산정 수행여부 :
 - 과업심의위원회 수행여부 :
 - SW영향평가 수행여부 :
 - 계약금액 조정 가능여부 :
 - 기술적용계획표 적용여부 :
 - 기술지원협약서, 기술지원확약서 제출여부 :
 - 제안서 보상여부 :
 - 하자담보책임기간 및 하자보수보증금율 :
 - 지체상금율 :
 - 지식재산권 공동소유 명시여부 :
 - 정보누출금지 명시여부 :
 - 제안무효·부적격·감점 등 정의여부 :
 - 수요기관 해석 우선적용 여부 :
 - 부당한 특약 여부 :
 - 추가제안 여부 :

< 제안서 평가관련 >
 - 평가주체 :
 - 평가방식 : 
 - 제안서 발표 여부 :
 - 평가결과공개 여부 :
 - 필수 제안평가 여부 :
 - 차등점수제 여부 :
 - 투입인력 요구사항 요구여부 :
 - 참여인력 학력 요구여부 :
 - ISP수행자 한단계 하위등급 : `;

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
        ]
      });

      // Remove asterisks and other markdown-like artifacts if they persist
      const cleanedText = response.text.replace(/\*/g, '');
      setResult(cleanedText);
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
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">조달청 RFP 사전 검토 서비스</h1>
            <p className="text-sm text-gray-500">협상에 의한 계약 제안요청서 자동 분석</p>
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
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  분석 결과
                </h2>
                <div className="flex items-center gap-2">
                  {result && (
                    <>
                      <button 
                        onClick={handleCopy}
                        className="text-xs bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 relative"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {showCopied ? '복사됨!' : '복사하기'}
                      </button>
                      <button 
                        onClick={() => {
                          setResult(null);
                          setFile(null);
                        }}
                        className="text-xs bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg font-medium transition-colors"
                      >
                        초기화
                      </button>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                        분석 완료
                      </span>
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
                      className="prose prose-sm max-w-none"
                      style={{ fontSize: '10pt' }}
                    >
                      <div className="whitespace-pre-wrap font-mono leading-relaxed text-gray-800 bg-gray-50 p-6 rounded-xl border border-gray-100">
                        {result}
                      </div>
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
      
      <footer className="mt-12 text-center text-gray-400 text-xs pb-8">
        © 2026 조달청 RFP 사전 검토 서비스. Powered by Gemini AI.
      </footer>
    </div>
  );
}
