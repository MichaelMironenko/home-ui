export const hasBrightnessCapability = (entity) =>
  (entity?.capabilities || []).some((cap) => {
    if ((cap?.type || '').includes('range')) {
      const instance = cap?.parameters?.instance || cap?.state?.instance;
      return instance === 'brightness';
    }
    return false;
  });

export const supportsColorCapability = (entity) =>
  (entity?.capabilities || []).some((cap) => {
    if (cap?.type !== 'devices.capabilities.color_setting') return false;
    const models = cap?.parameters?.color_models || [];
    const model = cap?.parameters?.color_model;
    return Boolean(
      model === 'hsv' ||
        model === 'rgb' ||
        model === 'xy' ||
        model === 'color_temperature' ||
        models.includes?.('hsv') ||
        models.includes?.('rgb') ||
        models.includes?.('color_temperature')
    );
  });

export const hasPowerCapability = (entity) =>
  (entity?.capabilities || []).some((cap) => cap?.type === 'devices.capabilities.on_off');

export const isTargetDevice = (device) => {
  if (!device) return false;
  const capabilityTypes = (device.capabilities || []).map((cap) => String(cap?.type || '').toLowerCase());
  const hasOnOff = capabilityTypes.includes('devices.capabilities.on_off');
  const hasBrightness = hasBrightnessCapability(device);
  const hasColor = supportsColorCapability(device);

  if (!hasOnOff && !hasBrightness && !hasColor) return false;

  const typeHints = [
    device.type,
    device.deviceType,
    device.device_type,
    device.kind,
    device.device_kind,
    device.icon,
  ]
    .map((value) => String(value || '').toLowerCase())
    .filter(Boolean);
  const mergedType = typeHints.join(' ');
  const name = String(device.name || '').toLowerCase();

  const looksLikeSensor = mergedType.includes('sensor');
  if (looksLikeSensor) return false;

  const looksLikeSwitch =
    mergedType.includes('switch') ||
    mergedType.includes('socket') ||
    mergedType.includes('outlet') ||
    mergedType.includes('plug') ||
    mergedType.includes('relay');
  const looksLikeLight =
    mergedType.includes('light') || mergedType.includes('lamp') || mergedType.includes('bulb') || mergedType.includes('strip');
  const lightNameHint = /(lamp|ламп|strip|подсвет|свет)/.test(name);
  const looksLikeMedia =
    mergedType.includes('media_device') || mergedType.includes('tv') || mergedType.includes('speaker');
  const mediaNameHint = /(tv|телев|yandex|станц|колонк|speaker|магритт|magritte)/.test(name);

  if (hasBrightness || hasColor) return true;
  if (!hasOnOff) return false;

  if ((looksLikeMedia || mediaNameHint) && !hasBrightness && !hasColor) return false;
  if (looksLikeLight || lightNameHint) return true;
  if (looksLikeSwitch && !lightNameHint) return false;

  const nonLightNameHints = /(розетк|socket|plug|outlet|утюг|чайник|кофе|пылесос|vacuum|humidifier|увлажнител|heater|обогрев|кондиционер|фен|робот|очистител|purifier|термостат|терморегул|штора|гардина)/.test(
    name
  );
  if (nonLightNameHints) return false;

  return hasOnOff;
};
