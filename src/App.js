/* global chrome */
import React, { useRef, useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Label from '@radix-ui/react-label';
import * as Toast from '@radix-ui/react-toast';
import { Pencil2Icon, CameraIcon, PaperPlaneIcon } from '@radix-ui/react-icons';
import './App.css';

function App() {
  const [step, setStep] = useState('idle');
  const [image, setImage] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastError, setToastError] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [token, setToken] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState('');
  const [sendWithImage, setSendWithImage] = useState(true);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const lastPoint = useRef(null);
  const [selectingArea, setSelectingArea] = useState(false);
  const [selection, setSelection] = useState(null); // {x, y, w, h}
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectedArea, setSelectedArea] = useState(null);

  // Carregar config do localStorage
  useEffect(() => {
    setToken(localStorage.getItem('linear_token') || '');
    setTeamId(localStorage.getItem('linear_teamId') || '');
  }, []);

  // Buscar times do usuário ao digitar token
  useEffect(() => {
    if (token && /^lin_api_/.test(token)) {
      setLoadingTeams(true);
      setTeamsError('');
      fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({
          query: `{
            teams {
              nodes {
                id
                name
                key
              }
            }
          }`
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data.errors) {
            setTeamsError(data.errors[0].message || 'Erro ao buscar times');
            setTeams([]);
          } else {
            setTeams(data.data.teams.nodes);
            // Se já tem teamId salvo, mantém selecionado
            // Se não, seleciona o primeiro time
            if (!teamId && data.data.teams.nodes.length > 0) {
              setTeamId(data.data.teams.nodes[0].id);
            }
          }
        })
        .catch(err => {
          setTeamsError('Erro ao buscar times: ' + err.message);
          setTeams([]);
        })
        .finally(() => setLoadingTeams(false));
    } else {
      setTeams([]);
    }
    // eslint-disable-next-line
  }, [token]);

  // Salvar config
  const saveConfig = () => {
    localStorage.setItem('linear_token', token);
    localStorage.setItem('linear_teamId', teamId);
    setShowConfig(false);
    setToastMsg('Configuração salva!');
    setToastError(false);
    setToastOpen(true);
  };

  // Ao abrir o popup, pedir ao background se há área selecionada
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_FEEDBACK_AREA' }, (res) => {
      if (res && res.area) {
        setSelectedArea(res.area);
      }
    });
  }, []);

  // Quando selectedArea mudar, capturar tela e recortar
  useEffect(() => {
    if (!selectedArea) return;
    setStep('capturing');
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      const img = new window.Image();
      img.onload = () => {
        const scaleX = img.naturalWidth / selectedArea.pageW;
        const scaleY = img.naturalHeight / selectedArea.pageH;
        const sx = Math.round(selectedArea.x * scaleX);
        const sy = Math.round(selectedArea.y * scaleY);
        const sw = Math.round(selectedArea.w * scaleX);
        const sh = Math.round(selectedArea.h * scaleY);
        const cropped = document.createElement('canvas');
        cropped.width = sw;
        cropped.height = sh;
        const ctx = cropped.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        setImage(cropped.toDataURL('image/png'));
        setStep('draw');
        setSelectedArea(null);
      };
      img.src = dataUrl;
    });
  }, [selectedArea]);

  // handleCapture só dispara a seleção
  const handleCapture = async () => {
    if (!window.chrome?.tabs) {
      alert('Só funciona como extensão Chrome!');
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: 'START_FEEDBACK_SELECTION' }, () => {
        window.close(); // Fecha o popup só depois de enviar a mensagem
      });
    });
  };

  // Seleção de área no canvas
  useEffect(() => {
    if (step === 'select' && image && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new window.Image();
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = image;
    }
  }, [step, image]);

  const handleSelectionMouseDown = (e) => {
    const rect = e.target.getBoundingClientRect();
    const scaleX = e.target.width / rect.width;
    const scaleY = e.target.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setSelectionStart({ x, y });
    setSelection({ x, y, w: 0, h: 0 });
    setSelectingArea(true);
  };
  const handleSelectionMouseMove = (e) => {
    if (!selectingArea || !selectionStart) return;
    const rect = e.target.getBoundingClientRect();
    const scaleX = e.target.width / rect.width;
    const scaleY = e.target.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setSelection({
      x: selectionStart.x,
      y: selectionStart.y,
      w: x - selectionStart.x,
      h: y - selectionStart.y,
    });
  };
  const handleSelectionMouseUp = () => {
    setSelectingArea(false);
  };

  // Desenhar retângulo de seleção
  useEffect(() => {
    if (step === 'select' && selection && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new window.Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        if (selection && (Math.abs(selection.w) > 5 && Math.abs(selection.h) > 5)) {
          ctx.save();
          ctx.strokeStyle = '#e11d48';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
          ctx.restore();
        }
      };
      img.src = image;
    }
  }, [step, selection, image]);

  // Recortar área selecionada e ir para etapa de desenho
  const handleCropAndDraw = () => {
    if (!selection || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const sx = Math.min(selection.x, selection.x + selection.w);
    const sy = Math.min(selection.y, selection.y + selection.h);
    const sw = Math.abs(selection.w);
    const sh = Math.abs(selection.h);
    const cropped = document.createElement('canvas');
    cropped.width = sw;
    cropped.height = sh;
    const ctx = cropped.getContext('2d');
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    setImage(cropped.toDataURL('image/png'));
    setStep('draw');
  };

  // Carregar a imagem no canvas ao abrir o modal
  useEffect(() => {
    if (step === 'draw' && image && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new window.Image();
      img.onload = () => {
        // Ajusta o tamanho do canvas para a imagem
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = image;
    }
  }, [step, image]);

  // Desenho sobre a imagem, corrigindo escala
  const handleCanvasMouseDown = (e) => {
    setDrawing(true);
    const rect = e.target.getBoundingClientRect();
    const scaleX = e.target.width / rect.width;
    const scaleY = e.target.height / rect.height;
    lastPoint.current = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };
  const handleCanvasMouseUp = () => setDrawing(false);
  const handleCanvasMouseMove = (e) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastPoint.current = { x, y };
  };

  // Função para reduzir e comprimir a imagem
  async function getCompressedImageDataUrl(canvas) {
    const maxWidth = 600;
    const scale = Math.min(1, maxWidth / canvas.width);
    const w = Math.round(canvas.width * scale);
    const h = Math.round(canvas.height * scale);
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = w;
    tmpCanvas.height = h;
    const ctx = tmpCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, w, h);
    // JPEG com qualidade 0.7
    return tmpCanvas.toDataURL('image/jpeg', 0.7);
  }

  // Envio real para o Linear
  const handleSend = async () => {
    if (!token || !teamId) {
      setToastMsg('Configure o token e selecione o time do Linear!');
      setToastError(true);
      setToastOpen(true);
      return;
    }
    if (!title.trim()) {
      setToastMsg('Preencha o título!');
      setToastError(true);
      setToastOpen(true);
      return;
    }
    if (!/^lin_api_/.test(token)) {
      setToastMsg('Token do Linear inválido!');
      setToastError(true);
      setToastOpen(true);
      return;
    }
    setStep('sending');
    let finalImage = '';
    if (sendWithImage) {
      finalImage = await getCompressedImageDataUrl(canvasRef.current);
    }
    const description = details + (sendWithImage && finalImage ? '\n\n![screenshot](' + finalImage + ')' : '');
    const mutation = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            url
          }
        }
      }
    `;
    const variables = {
      input: {
        teamId,
        title,
        description,
      }
    };
    try {
      const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({ query: mutation, variables })
      });
      const data = await res.json();
      if (data?.data?.issueCreate?.success) {
        setToastMsg('Feedback enviado para o Linear!');
        setToastError(false);
        setToastOpen(true);
        setStep('idle');
        setImage(null);
        setTitle('');
        setDetails('');
      } else {
        const gqlError = data.errors?.[0];
        setToastMsg('Erro ao enviar para o Linear: ' + (gqlError?.message || 'Erro desconhecido') + (gqlError ? '\n' + JSON.stringify(gqlError, null, 2) : ''));
        setToastError(true);
        setToastOpen(true);
        setStep('draw');
      }
    } catch (err) {
      setToastMsg('Erro ao enviar para o Linear: ' + err.message);
      setToastError(true);
      setToastOpen(true);
      setStep('draw');
    }
  };

  // Renderização
  return (
    <div className="App" style={{ padding: 24, minWidth: 340 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Feedback para o Linear</h2>
        <button className="radix-btn" style={{ fontSize: 14, padding: '4px 10px' }} onClick={() => setShowConfig(true)}>
          Config
        </button>
      </div>
      {showConfig && (
        <Dialog.Root open onOpenChange={setShowConfig}>
          <Dialog.Content className="radix-dialog-content">
            <h3>Configuração do Linear</h3>
            <Label.Root htmlFor="token">Token do Linear</Label.Root>
            <input
              id="token"
              value={token}
              onChange={e => setToken(e.target.value)}
              style={{ padding: 8, borderRadius: 4, border: '1px solid #e5e7eb', width: '100%' }}
              placeholder="Token pessoal do Linear"
            />
            {token && !/^lin_api_/.test(token) && (
              <p style={{ color: '#b91c1c', fontSize: 12 }}>Token inválido. Deve começar com lin_api_</p>
            )}
            {token && /^lin_api_/.test(token) && (
              <div style={{ marginTop: 12 }}>
                <Label.Root htmlFor="teamId">Selecione o time</Label.Root>
                {loadingTeams && <p style={{ fontSize: 12 }}>Carregando times...</p>}
                {teamsError && <p style={{ color: '#b91c1c', fontSize: 12 }}>{teamsError}</p>}
                {!loadingTeams && !teamsError && (
                  <select
                    id="teamId"
                    value={teamId}
                    onChange={e => setTeamId(e.target.value)}
                    style={{ padding: 8, borderRadius: 4, border: '1px solid #e5e7eb', width: '100%' }}
                  >
                    {teams.map(team => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({team.key})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="radix-btn" onClick={saveConfig} disabled={!token || !teamId}>Salvar</button>
              <button className="radix-btn" style={{ background: '#e5e7eb', color: '#222' }} onClick={() => setShowConfig(false)}>Cancelar</button>
            </div>
            <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
              Gere um token em <a href="https://linear.app/settings/api" target="_blank" rel="noreferrer">linear.app/settings/api</a>.<br />
              O time será listado automaticamente após informar o token.
            </p>
          </Dialog.Content>
        </Dialog.Root>
      )}
      {step === 'idle' && (
        <button className="radix-btn" onClick={handleCapture} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CameraIcon /> Capturar tela da aba
        </button>
      )}
      {step === 'capturing' && <p>Capturando tela...</p>}
      {step === 'draw' && image && (
        <Dialog.Root open>
          <Dialog.Content className="radix-dialog-content">
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <label style={{ fontSize: 12 }}>
                <input type="checkbox" checked={sendWithImage} onChange={e => setSendWithImage(e.target.checked)} />
                Incluir screenshot na descrição
              </label>
            </div>
            <div style={{ position: 'relative', marginBottom: 16, width: 320 }}>
              {/* Carrega a imagem no canvas ao abrir o modal */}
              <canvas
                ref={canvasRef}
                style={{ border: '2px solid #e5e7eb', borderRadius: 8, cursor: 'crosshair', maxWidth: 320, width: '100%', display: 'block' }}
                onMouseDown={e => handleCanvasMouseDown(e)}
                onMouseUp={handleCanvasMouseUp}
                onMouseOut={handleCanvasMouseUp}
                onMouseMove={e => handleCanvasMouseMove(e)}
              />
              <span style={{ position: 'absolute', top: 8, left: 8, background: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 12, color: '#e11d48', display: 'flex', alignItems: 'center', gap: 4 }}><Pencil2Icon />Desenhe aqui</span>
            </div>
            <form
              onSubmit={e => {
                e.preventDefault();
                handleSend();
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <Label.Root htmlFor="title">Título</Label.Root>
              <input
                id="title"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                style={{ padding: 8, borderRadius: 4, border: '1px solid #e5e7eb' }}
              />
              <Label.Root htmlFor="details">Detalhes</Label.Root>
              <textarea
                id="details"
                required
                value={details}
                onChange={e => setDetails(e.target.value)}
                style={{ padding: 8, borderRadius: 4, border: '1px solid #e5e7eb', minHeight: 60 }}
              />
              <button type="submit" className="radix-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <PaperPlaneIcon /> Enviar para o Linear
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Root>
      )}
      {step === 'sending' && <p>Enviando feedback...</p>}
      <Toast.Provider swipeDirection="right">
        <Toast.Root open={toastOpen} onOpenChange={setToastOpen} className="radix-toast-root" style={toastError ? { background: '#fee2e2', color: '#b91c1c', maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' } : { maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
          <Toast.Title>{toastError ? 'Erro' : 'Feedback enviado!'}</Toast.Title>
          <Toast.Description>{toastMsg}</Toast.Description>
          {toastError && (
            <button style={{ marginTop: 8, fontSize: 12, background: '#e5e7eb', color: '#222', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}
              onClick={() => { navigator.clipboard.writeText(toastMsg); }}>
              Copiar erro
            </button>
          )}
        </Toast.Root>
        <Toast.Viewport className="radix-toast-viewport" />
      </Toast.Provider>
    </div>
  );
}

export default App;
