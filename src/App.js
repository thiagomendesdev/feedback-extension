/* global chrome */
import React, { useRef, useState, useEffect } from 'react';
import { 
  Container, 
  Button, 
  TextInput, 
  Textarea, 
  Group, 
  Text, 
  Select, 
  Checkbox, 
  ActionIcon, 
  Stack, 
  Flex,
  Anchor,
  Loader,
  Alert
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { 
  IconPencil, 
  IconCamera, 
  IconSend, 
  IconSquare, 
  IconCircle, 
  IconTrash,
  IconSettings
} from '@tabler/icons-react';

function App() {
  const [step, setStep] = useState('idle');
  const [image, setImage] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [token, setToken] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState('');
  const canvasRef = useRef(null);
  const lastPoint = useRef(null);
  const [selectedArea, setSelectedArea] = useState(null);
  const [useTimer, setUseTimer] = useState(false);
  const [drawMode, setDrawMode] = useState('free'); // 'free' | 'rect' | 'circle' | 'line' | 'arrow'
  const [shapes, setShapes] = useState([]); // {type, x, y, w, h}
  const [currentShape, setCurrentShape] = useState(null); // preview do shape
  const [freeDrawings, setFreeDrawings] = useState([]); // array de paths: [{points: [{x, y}]}]

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
            setTeamsError(data.errors[0].message || 'Error fetching teams');
            setTeams([]);
          } else {
            const teamsData = data.data.teams.nodes.map(team => ({
              value: team.id,
              label: `${team.name} (${team.key})`
            }));
            setTeams(teamsData);
            // Se já tem teamId salvo, mantém selecionado
            // Se não, seleciona o primeiro time
            if (!teamId && data.data.teams.nodes.length > 0) {
              setTeamId(data.data.teams.nodes[0].id);
            }
          }
        })
        .catch(err => {
          setTeamsError('Error fetching teams: ' + err.message);
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
    setStep('idle');
    notifications.show({
      title: 'Success!',
      message: 'Configuration saved!',
      color: 'green'
    });
    
    // Close the overlay if we're in iframe mode
    setTimeout(() => {
      if (window.parent !== window) {
        window.parent.postMessage('closeFeedbackOverlay', '*');
      }
    }, 1500);
  };

  // Ao abrir o popup, pedir ao background se há área selecionada
  useEffect(() => {
    // Check URL parameters first (for iframe mode)
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');

    if (mode === 'edit') {
      // We're in edit mode via iframe
      setStep('capturing'); // Show loading state
      
      // Listen for data from parent window
      const handleMessage = (event) => {
        if (event.data.type === 'feedbackData') {
          setSelectedArea(event.data.areaData);
          setImage(event.data.imageData);
          setStep('draw');
        }
      };
      
      window.addEventListener('message', handleMessage);
      
      // Signal that iframe is ready
      if (window.parent !== window) {
        window.parent.postMessage('iframeReady', '*');
      }
      
      return () => {
        window.removeEventListener('message', handleMessage);
      };
    } else if (mode === 'config') {
      // We're in config mode via iframe
      setStep('config');
    } else {
      // Fallback to original logic for non-iframe usage
      // Check if we have area data from the overlay
      if (window.parent.__feedbackAreaData) {
        setSelectedArea(window.parent.__feedbackAreaData);
      } else {
        // Fallback to background script check
        chrome.runtime.sendMessage({ type: 'GET_FEEDBACK_AREA' }, (res) => {
          if (res && res.area) {
            setSelectedArea(res.area);
          }
        });
      }

      // Check if we should open config immediately
      if (window.parent.__feedbackConfigMode) {
        setStep('config');
      } else {
        chrome.runtime.sendMessage({ type: 'CHECK_SHOULD_OPEN_CONFIG' }, (res) => {
          if (res && res.shouldOpenConfig) {
            setStep('config');
          }
        });
      }
    }

    // Listen for config opening request
    const handleConfigMessage = (msg) => {
      if (msg.type === 'OPEN_CONFIG') {
        setStep('config');
      }
    };

    chrome.runtime.onMessage.addListener(handleConfigMessage);
    
    return () => {
      chrome.runtime.onMessage.removeListener(handleConfigMessage);
    };
  }, []);

  // Quando selectedArea mudar, capturar tela e recortar (only for non-iframe mode)
  useEffect(() => {
    if (!selectedArea) return;
    
    // Skip capture if we're in iframe mode (image already provided)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'edit') {
      return; // Image is already set above
    }
    
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

  // handleCapture agora suporta timer
  const handleCapture = async () => {
    if (!window.chrome?.tabs) {
      notifications.show({
        title: 'Error',
        message: 'Only works as Chrome extension!',
        color: 'red'
      });
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: 'START_FEEDBACK_SELECTION', timer: useTimer }, () => {
        window.close();
      });
    });
  };

  // Desenho sobre a imagem, corrigindo escala
  const handleCanvasMouseDown = (e) => {
    const rect = e.target.getBoundingClientRect();
    const scaleX = e.target.width / rect.width;
    const scaleY = e.target.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    if (drawMode === 'free') {
      setDrawing(true);
      lastPoint.current = { x, y };
      setFreeDrawings(freeDrawings => [...freeDrawings, { points: [{ x, y }] }]);
    } else if (['rect', 'circle', 'line', 'arrow'].includes(drawMode)) {
      setDrawing(true);
      setCurrentShape({ type: drawMode, x, y, w: 0, h: 0 });
    }
  };
  const handleCanvasMouseUp = () => {
    if (drawMode === 'free') {
      setDrawing(false);
    } else if (['rect', 'circle', 'line', 'arrow'].includes(drawMode) && currentShape) {
      setDrawing(false);
      setShapes([...shapes, currentShape]);
      setCurrentShape(null);
    }
  };
  const handleCanvasMouseMove = (e) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    if (drawMode === 'free') {
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      lastPoint.current = { x, y };
      setFreeDrawings(freeDrawings => {
        const updated = [...freeDrawings];
        updated[updated.length - 1] = {
          points: [...updated[updated.length - 1].points, { x, y }]
        };
        return updated;
      });
    } else if (['rect', 'circle', 'line', 'arrow'].includes(drawMode) && currentShape) {
      setCurrentShape({
        ...currentShape,
        w: x - currentShape.x,
        h: y - currentShape.y,
      });
    }
  };

  // Redesenhar tudo ao mudar shapes, imagem, currentShape ou freeDrawings
  useEffect(() => {
    if (step !== 'draw' || !image || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new window.Image();
    img.onload = () => {
      // Set canvas to image's natural dimensions
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      // Calculate display size that fits within container while maintaining aspect ratio
      const containerMaxWidth = canvas.parentElement.clientWidth - 20; // Account for border and padding
      const containerMaxHeight = canvas.parentElement.clientHeight - 20;
      
      const scaleX = containerMaxWidth / img.naturalWidth;
      const scaleY = containerMaxHeight / img.naturalHeight;
      const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
      
      canvas.style.width = (img.naturalWidth * scale) + 'px';
      canvas.style.height = (img.naturalHeight * scale) + 'px';
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      // Desenho livre
      ctx.save();
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      freeDrawings.forEach(path => {
        if (path.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x, path.points[i].y);
        }
        ctx.stroke();
      });
      ctx.restore();
      // shapes
      shapes.forEach(shape => {
        ctx.save();
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        if (shape.type === 'rect') {
          ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
        } else if (shape.type === 'circle') {
          ctx.beginPath();
          ctx.ellipse(
            shape.x + shape.w / 2,
            shape.y + shape.h / 2,
            Math.abs(shape.w / 2),
            Math.abs(shape.h / 2),
            0, 0, 2 * Math.PI
          );
          ctx.stroke();
        } else if (shape.type === 'line') {
          ctx.beginPath();
          ctx.moveTo(shape.x, shape.y);
          ctx.lineTo(shape.x + shape.w, shape.y + shape.h);
          ctx.stroke();
        } else if (shape.type === 'arrow') {
          // Draw line
          ctx.beginPath();
          ctx.moveTo(shape.x, shape.y);
          ctx.lineTo(shape.x + shape.w, shape.y + shape.h);
          ctx.stroke();
          
          // Draw arrowhead
          const angle = Math.atan2(shape.h, shape.w);
          const headlen = 15; // Arrow head length
          ctx.beginPath();
          ctx.moveTo(shape.x + shape.w, shape.y + shape.h);
          ctx.lineTo(
            shape.x + shape.w - headlen * Math.cos(angle - Math.PI / 6),
            shape.y + shape.h - headlen * Math.sin(angle - Math.PI / 6)
          );
          ctx.moveTo(shape.x + shape.w, shape.y + shape.h);
          ctx.lineTo(
            shape.x + shape.w - headlen * Math.cos(angle + Math.PI / 6),
            shape.y + shape.h - headlen * Math.sin(angle + Math.PI / 6)
          );
          ctx.stroke();
        }
        ctx.restore();
      });
      // preview
      if (currentShape) {
        ctx.save();
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        if (currentShape.type === 'rect') {
          ctx.strokeRect(currentShape.x, currentShape.y, currentShape.w, currentShape.h);
        } else if (currentShape.type === 'circle') {
          ctx.beginPath();
          ctx.ellipse(
            currentShape.x + currentShape.w / 2,
            currentShape.y + currentShape.h / 2,
            Math.abs(currentShape.w / 2),
            Math.abs(currentShape.h / 2),
            0, 0, 2 * Math.PI
          );
          ctx.stroke();
        } else if (currentShape.type === 'line') {
          ctx.beginPath();
          ctx.moveTo(currentShape.x, currentShape.y);
          ctx.lineTo(currentShape.x + currentShape.w, currentShape.y + currentShape.h);
          ctx.stroke();
        } else if (currentShape.type === 'arrow') {
          // Draw line
          ctx.beginPath();
          ctx.moveTo(currentShape.x, currentShape.y);
          ctx.lineTo(currentShape.x + currentShape.w, currentShape.y + currentShape.h);
          ctx.stroke();
          
          // Draw arrowhead
          const angle = Math.atan2(currentShape.h, currentShape.w);
          const headlen = 15; // Arrow head length
          ctx.beginPath();
          ctx.moveTo(currentShape.x + currentShape.w, currentShape.y + currentShape.h);
          ctx.lineTo(
            currentShape.x + currentShape.w - headlen * Math.cos(angle - Math.PI / 6),
            currentShape.y + currentShape.h - headlen * Math.sin(angle - Math.PI / 6)
          );
          ctx.moveTo(currentShape.x + currentShape.w, currentShape.y + currentShape.h);
          ctx.lineTo(
            currentShape.x + currentShape.w - headlen * Math.cos(angle + Math.PI / 6),
            currentShape.y + currentShape.h - headlen * Math.sin(angle + Math.PI / 6)
          );
          ctx.stroke();
        }
        ctx.restore();
      }
    };
    img.src = image;
  }, [step, image, shapes, currentShape, freeDrawings]);

  // Limpar desenhos
  const handleClearDrawings = () => {
    if (!canvasRef.current || !image) return;
    setShapes([]);
    setCurrentShape(null);
    setFreeDrawings([]);
    // Redesenha só a imagem
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new window.Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      // Calculate display size that fits within container while maintaining aspect ratio
      const containerMaxWidth = canvas.parentElement.clientWidth - 20;
      const containerMaxHeight = canvas.parentElement.clientHeight - 20;
      
      const scaleX = containerMaxWidth / img.naturalWidth;
      const scaleY = containerMaxHeight / img.naturalHeight;
      const scale = Math.min(scaleX, scaleY, 1);
      
      canvas.style.width = (img.naturalWidth * scale) + 'px';
      canvas.style.height = (img.naturalHeight * scale) + 'px';
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = image;
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

  // Função para coletar informações do ambiente
  function collectFrontendEnvInfo() {
    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      screen: {
        width: window.screen.width,
        height: window.screen.height,
      },
      devicePixelRatio: window.devicePixelRatio,
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages,
      platform: navigator.platform,
      colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      date: new Date().toISOString(),
    };
  }

  // Envio real para o Linear
  const handleSend = async () => {
    if (!token || !teamId) {
      notifications.show({
        title: 'Error',
        message: 'Configure the Linear token and select a team!',
        color: 'red'
      });
      return;
    }
    if (!title.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Please fill in the title!',
        color: 'red'
      });
      return;
    }
    if (!/^lin_api_/.test(token)) {
      notifications.show({
        title: 'Error',
        message: 'Invalid Linear token!',
        color: 'red'
      });
      return;
    }
    
    setStep('sending');
    let finalImage = '';
    finalImage = await getCompressedImageDataUrl(canvasRef.current);
    // Coletar informações do ambiente
    const envInfo = collectFrontendEnvInfo();
    // Pegar URL da aba ativa
    function sendWithTabUrl(tabUrl) {
      envInfo.tabUrl = tabUrl;
      const description = details +
        (finalImage ? '\n\n![screenshot](' + finalImage + ')' : '') +
        '\n\n---\nEnvironment Info:\n```json\n' + JSON.stringify(envInfo, null, 2) + '\n```';
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
      fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({ query: mutation, variables })
      })
        .then(res => res.json())
        .then(data => {
          if (data?.data?.issueCreate?.success) {
            notifications.show({
              title: 'Success!',
              message: 'Feedback sent to Linear!',
              color: 'green'
            });
            setStep('idle');
            setImage(null);
            setTitle('');
            setDetails('');
            
            // Close the overlay if we're in iframe mode
            setTimeout(() => {
              if (window.parent !== window) {
                window.parent.postMessage('closeFeedbackOverlay', '*');
              }
            }, 1500);
          } else {
            const gqlError = data.errors?.[0];
            notifications.show({
              title: 'Error',
              message: 'Error sending to Linear: ' + (gqlError?.message || 'Unknown error'),
              color: 'red'
            });
            setStep('draw');
          }
        })
        .catch(err => {
          notifications.show({
            title: 'Error',
            message: 'Error sending to Linear: ' + err.message,
            color: 'red'
          });
          setStep('draw');
        });
    }
    if (window.chrome?.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        sendWithTabUrl(tabs[0]?.url || '');
      });
    } else {
      sendWithTabUrl('');
    }
  };

  // Renderização
  return (
    <Container size="xl" p={0} style={{ minWidth: 1000, maxWidth: 1000, height: '100vh' }}>
      {step === 'idle' && (
        <div style={{ padding: '24px' }}>
          <Stack gap="md">
            <Flex justify="flex-end" align="center">
              <ActionIcon variant="light" onClick={() => setStep('config')} size="lg">
                <IconSettings size={18} />
              </ActionIcon>
            </Flex>
            
            <Group>
              <Button 
                leftSection={<IconCamera size={16} />} 
                onClick={handleCapture}
                variant="filled"
              >
                Capture tab screen
              </Button>
              <Checkbox 
                label="3s Timer" 
                checked={useTimer} 
                onChange={(e) => setUseTimer(e.currentTarget.checked)}
                size="sm"
              />
            </Group>
          </Stack>
        </div>
      )}

      {step === 'capturing' && (
        <Group justify="center" style={{ minHeight: '200px', alignItems: 'center' }}>
          <Loader size="sm" />
          <Text>Capturing screen...</Text>
        </Group>
      )}

      {step === 'draw' && (
        <div style={{ height: '100vh', display: 'flex', gap: '32px', padding: '24px' }}>
          {/* Left side - Canvas area */}
          <div style={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            position: 'relative',
            background: '#f8f9fa', // Mantine gray.1
            borderRadius: '12px',
            padding: '16px',
            overflow: 'hidden'
          }}>
            {image ? (
              <>
                <canvas
                  ref={canvasRef}
                  style={{ 
                    border: '2px solid #e9ecef', 
                    borderRadius: 8, 
                    cursor: drawMode === 'free' ? 'crosshair' : 'pointer', 
                    maxWidth: '100%', 
                    maxHeight: '100%',
                    display: 'block',
                    objectFit: 'contain'
                  }}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseOut={handleCanvasMouseUp}
                  onMouseMove={handleCanvasMouseMove}
                />
                
                {/* Floating drawing tools */}
                <div 
                  style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    display: drawing ? 'none' : 'flex',
                    gap: '8px',
                    background: 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(12px)',
                    borderRadius: '8px',
                    padding: '8px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    zIndex: 10
                  }}
                >
                  <ActionIcon 
                    variant={drawMode === 'free' ? 'filled' : 'light'}
                    onClick={() => setDrawMode('free')}
                    title="Free drawing"
                    size="sm"
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                  <ActionIcon 
                    variant={drawMode === 'line' ? 'filled' : 'light'}
                    onClick={() => setDrawMode('line')}
                    title="Line"
                    size="sm"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="7" y1="17" x2="17" y2="7"></line>
                    </svg>
                  </ActionIcon>
                  <ActionIcon 
                    variant={drawMode === 'arrow' ? 'filled' : 'light'}
                    onClick={() => setDrawMode('arrow')}
                    title="Arrow"
                    size="sm"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="7" y1="17" x2="17" y2="7"></line>
                      <polyline points="7,7 17,7 17,17"></polyline>
                    </svg>
                  </ActionIcon>
                  <ActionIcon 
                    variant={drawMode === 'rect' ? 'filled' : 'light'}
                    onClick={() => setDrawMode('rect')}
                    title="Rectangle"
                    size="sm"
                  >
                    <IconSquare size={16} />
                  </ActionIcon>
                  <ActionIcon 
                    variant={drawMode === 'circle' ? 'filled' : 'light'}
                    onClick={() => setDrawMode('circle')}
                    title="Circle"
                    size="sm"
                  >
                    <IconCircle size={16} />
                  </ActionIcon>
                  <ActionIcon 
                    variant="light"
                    onClick={handleClearDrawings}
                    title="Clear drawings"
                    color="red"
                    size="sm"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </div>
              </>
            ) : (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                border: '1px dashed #ccc',
                borderRadius: '8px',
                width: '100%',
                height: '200px'
              }}>
                <Text c="dimmed">Waiting for image...</Text>
              </div>
            )}
          </div>

          {/* Right side - Form */}
          <div style={{ width: '300px', display: 'flex', flexDirection: 'column' }}>
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Stack gap="md" style={{ flex: 1 }}>
                <div>
                  <Text size="lg" fw={600} mb="md">Feedback</Text>
                </div>
                
                <TextInput
                  label="Title"
                  placeholder="Feedback title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.currentTarget.value)}
                  size="sm"
                />
                
                <Textarea
                  label="Description"
                  placeholder="Describe the issue or suggestion"
                  value={details}
                  onChange={(e) => setDetails(e.currentTarget.value)}
                  minRows={8}
                  maxRows={12}
                  size="sm"
                  style={{ flex: 1 }}
                />
                
                <Button 
                  type="submit" 
                  leftSection={<IconSend size={16} />}
                  size="md"
                  fullWidth
                  style={{ marginTop: 'auto' }}
                >
                  Send to Linear
                </Button>
              </Stack>
            </form>
          </div>
        </div>
      )}

      {step === 'sending' && (
        <Group justify="center" style={{ minHeight: '200px', alignItems: 'center' }}>
          <Loader size="sm" />
          <Text>Sending feedback...</Text>
        </Group>
      )}

      {step === 'config' && (
        <div style={{ padding: '24px', height: '100vh', overflow: 'auto' }}>
          <Stack gap="md" style={{ maxWidth: '400px' }}>
            <div>
              <Text size="xl" fw={600}>Linear Configuration</Text>
            </div>

            <TextInput
              label="Linear Token"
              placeholder="Personal Linear token"
              value={token}
              onChange={(e) => setToken(e.currentTarget.value)}
              size="sm"
            />
            
            {token && !/^lin_api_/.test(token) && (
              <Alert color="red" variant="light" size="sm">
                Invalid token. Must start with lin_api_
              </Alert>
            )}
            
            {token && /^lin_api_/.test(token) && (
              <Stack gap="sm">
                <Text size="sm" fw={500}>Select team</Text>
                {loadingTeams && (
                  <Group>
                    <Loader size="xs" />
                    <Text size="sm">Loading teams...</Text>
                  </Group>
                )}
                {teamsError && (
                  <Alert color="red" variant="light" size="sm">
                    {teamsError}
                  </Alert>
                )}
                {!loadingTeams && !teamsError && teams.length > 0 && (
                  <Select
                    data={teams}
                    value={teamId}
                    onChange={setTeamId}
                    placeholder="Select a team"
                    size="sm"
                  />
                )}
              </Stack>
            )}
            
            <Group mt="md">
              <Button onClick={saveConfig} disabled={!token || !teamId} size="sm">
                Save
              </Button>
            </Group>
            
            <Text size="xs" c="dimmed">
              You can generate an API token at{' '}
              <Anchor href="https://linear.app/moises/settings/account/security/api-keys/new" target="_blank">
                linear.app/moises/settings/account/security/api-keys/new
              </Anchor>
            </Text>
          </Stack>
        </div>
      )}
    </Container>
  );
}

export default App;
