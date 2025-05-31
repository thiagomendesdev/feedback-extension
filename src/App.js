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
  IconSettings,
  IconArrowLeft
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
  const [drawMode, setDrawMode] = useState('free'); // 'free' | 'rect' | 'circle'
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
            setTeamsError(data.errors[0].message || 'Erro ao buscar times');
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
    setStep('idle');
    notifications.show({
      title: 'Sucesso!',
      message: 'Configuração salva!',
      color: 'green'
    });
  };

  // Ao abrir o popup, pedir ao background se há área selecionada
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_FEEDBACK_AREA' }, (res) => {
      if (res && res.area) {
        setSelectedArea(res.area);
      }
    });

    // Check if we should open config immediately
    chrome.runtime.sendMessage({ type: 'CHECK_SHOULD_OPEN_CONFIG' }, (res) => {
      if (res && res.shouldOpenConfig) {
        setStep('config');
      }
    });

    // Listen for config opening request
    const handleMessage = (msg) => {
      if (msg.type === 'OPEN_CONFIG') {
        setStep('config');
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
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

  // handleCapture agora suporta timer
  const handleCapture = async () => {
    if (!window.chrome?.tabs) {
      notifications.show({
        title: 'Erro',
        message: 'Só funciona como extensão Chrome!',
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
    } else if (drawMode === 'rect' || drawMode === 'circle') {
      setDrawing(true);
      setCurrentShape({ type: drawMode, x, y, w: 0, h: 0 });
    }
  };
  const handleCanvasMouseUp = () => {
    if (drawMode === 'free') {
      setDrawing(false);
    } else if ((drawMode === 'rect' || drawMode === 'circle') && currentShape) {
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
    } else if ((drawMode === 'rect' || drawMode === 'circle') && currentShape) {
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
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
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
        title: 'Erro',
        message: 'Configure o token e selecione o time do Linear!',
        color: 'red'
      });
      return;
    }
    if (!title.trim()) {
      notifications.show({
        title: 'Erro',
        message: 'Preencha o título!',
        color: 'red'
      });
      return;
    }
    if (!/^lin_api_/.test(token)) {
      notifications.show({
        title: 'Erro',
        message: 'Token do Linear inválido!',
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
        '\n\n---\nInformações do ambiente:\n```json\n' + JSON.stringify(envInfo, null, 2) + '\n```';
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
              title: 'Sucesso!',
              message: 'Feedback enviado para o Linear!',
              color: 'green'
            });
            setStep('idle');
            setImage(null);
            setTitle('');
            setDetails('');
          } else {
            const gqlError = data.errors?.[0];
            notifications.show({
              title: 'Erro',
              message: 'Erro ao enviar para o Linear: ' + (gqlError?.message || 'Erro desconhecido'),
              color: 'red'
            });
            setStep('draw');
          }
        })
        .catch(err => {
          notifications.show({
            title: 'Erro',
            message: 'Erro ao enviar para o Linear: ' + err.message,
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
    <Container size="sm" p="md" style={{ minWidth: 340 }}>
      {step === 'idle' && (
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
              Capturar tela da aba
            </Button>
            <Checkbox 
              label="Timer 3s" 
              checked={useTimer} 
              onChange={(e) => setUseTimer(e.currentTarget.checked)}
              size="sm"
            />
          </Group>
        </Stack>
      )}

      {step === 'capturing' && (
        <Group justify="center" style={{ minHeight: '200px', alignItems: 'center' }}>
          <Loader size="sm" />
          <Text>Capturando tela...</Text>
        </Group>
      )}

      {step === 'draw' && (
        <Stack gap="xs" style={{ minHeight: '95vh' }}>
          <Group justify="flex-end" align="center">
            <ActionIcon.Group>
              <ActionIcon 
                variant={drawMode === 'free' ? 'filled' : 'light'}
                onClick={() => setDrawMode('free')}
                title="Desenho livre"
              >
                <IconPencil size={16} />
              </ActionIcon>
              <ActionIcon 
                variant={drawMode === 'rect' ? 'filled' : 'light'}
                onClick={() => setDrawMode('rect')}
                title="Retângulo"
              >
                <IconSquare size={16} />
              </ActionIcon>
              <ActionIcon 
                variant={drawMode === 'circle' ? 'filled' : 'light'}
                onClick={() => setDrawMode('circle')}
                title="Círculo"
              >
                <IconCircle size={16} />
              </ActionIcon>
              <ActionIcon 
                variant="light"
                onClick={handleClearDrawings}
                title="Limpar desenhos"
                color="red"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </ActionIcon.Group>
          </Group>

          {image ? (
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              minHeight: '60vh'
            }}>
              <canvas
                ref={canvasRef}
                style={{ 
                  border: '2px solid #e9ecef', 
                  borderRadius: 8, 
                  cursor: drawMode === 'free' ? 'crosshair' : 'pointer', 
                  maxWidth: '100%', 
                  maxHeight: '60vh',
                  display: 'block'
                }}
                onMouseDown={handleCanvasMouseDown}
                onMouseUp={handleCanvasMouseUp}
                onMouseOut={handleCanvasMouseUp}
                onMouseMove={handleCanvasMouseMove}
              />
            </div>
          ) : (
            <div style={{ 
              minHeight: '60vh', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              border: '1px dashed #ccc',
              borderRadius: '8px'
            }}>
              <Text c="dimmed">Aguardando imagem...</Text>
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} style={{ marginTop: 'auto' }}>
            <Stack gap="xs">
              <TextInput
                placeholder="Título do feedback"
                required
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
              />
              <Textarea
                placeholder="Descreva o problema ou sugestão"
                value={details}
                onChange={(e) => setDetails(e.currentTarget.value)}
                minRows={2}
                maxRows={3}
              />
              <Group justify="flex-end">
                <Button 
                  type="submit" 
                  leftSection={<IconSend size={16} />}
                  size="sm"
                >
                  Enviar para o Linear
                </Button>
              </Group>
            </Stack>
          </form>
        </Stack>
      )}

      {step === 'sending' && (
        <Group justify="center" style={{ minHeight: '200px', alignItems: 'center' }}>
          <Loader size="sm" />
          <Text>Enviando feedback...</Text>
        </Group>
      )}

      {step === 'config' && (
        <Stack gap="md">
          <Flex justify="space-between" align="center">
            <Text size="xl" fw={600}>Configuração do Linear</Text>
            <ActionIcon variant="light" onClick={() => setStep('idle')} size="lg" title="Voltar">
              <IconArrowLeft size={18} />
            </ActionIcon>
          </Flex>

          <TextInput
            label="Token do Linear"
            placeholder="Token pessoal do Linear"
            value={token}
            onChange={(e) => setToken(e.currentTarget.value)}
          />
          
          {token && !/^lin_api_/.test(token) && (
            <Alert color="red" variant="light">
              Token inválido. Deve começar com lin_api_
            </Alert>
          )}
          
          {token && /^lin_api_/.test(token) && (
            <Stack gap="sm">
              <Text size="sm" fw={500}>Selecione o time</Text>
              {loadingTeams && (
                <Group>
                  <Loader size="xs" />
                  <Text size="sm">Carregando times...</Text>
                </Group>
              )}
              {teamsError && (
                <Alert color="red" variant="light">
                  {teamsError}
                </Alert>
              )}
              {!loadingTeams && !teamsError && teams.length > 0 && (
                <Select
                  data={teams}
                  value={teamId}
                  onChange={setTeamId}
                  placeholder="Selecione um time"
                />
              )}
            </Stack>
          )}
          
          <Group mt="md">
            <Button onClick={saveConfig} disabled={!token || !teamId}>
              Salvar
            </Button>
            <Button variant="light" onClick={() => setStep('idle')}>
              Voltar
            </Button>
          </Group>
          
          <Text size="xs" c="dimmed">
            Você pode gerar um token de API em{' '}
            <Anchor href="https://linear.app/moises/settings/account/security/api-keys/new" target="_blank">
              linear.app/moises/settings/account/security/api-keys/new
            </Anchor>
          </Text>
        </Stack>
      )}
    </Container>
  );
}

export default App;
