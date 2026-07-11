// src/components/JitsiMeeting.jsx
import React, { useEffect, useRef } from 'react';

const JitsiMeeting = ({ roomName, displayName, onMeetingEnd, onParticipantJoined }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    // Load Jitsi external API script from 8x8.vc
    const script = document.createElement('script');
    script.src = 'https://8x8.vc/vpaas-magic-cookie-0067c0e65ee04712bc143fa30be5f386/external_api.js';
    script.async = true;
    script.onload = () => {
      const domain = '8x8.vc';
      const appId = import.meta.env.VITE_JITSI_APP_ID;
      
      // Construct room name in the format: appId/roomName
      const fullRoomName = `${appId}/${roomName}`;

      const options = {
        roomName: fullRoomName,
        width: '100%',
        height: '100%',
        parentNode: containerRef.current,
        userInfo: {
          displayName: displayName || 'Guest',
        },
        configOverwrite: {
          enableLobby: false,
          membersOnly: false,
          startWithAudioMuted: true,
          startWithVideoMuted: true,
          disableDeepLinking: true,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
        },
        // jwt: null // Not required for basic meetings with 8x8.vc
      };

      try {
        const api = new window.JitsiMeetExternalAPI(domain, options);

        api.addEventListener('videoConferenceJoined', () => {
          console.log('Joined conference');
        });

        api.addEventListener('participantJoined', (event) => {
          const { displayName: participantName } = event;
          if (onParticipantJoined) onParticipantJoined(participantName);
        });

        api.addEventListener('videoConferenceLeft', () => {
          if (onMeetingEnd) onMeetingEnd();
          api.dispose();
        });

        window.jitsiApi = api;
      } catch (error) {
        console.warn('Jitsi initialization error:', error);
        if (onMeetingEnd) onMeetingEnd();
      }
    };

    document.head.appendChild(script);

    return () => {
      if (window.jitsiApi) {
        window.jitsiApi.dispose();
        delete window.jitsiApi;
      }
    };
  }, [roomName, displayName, onMeetingEnd, onParticipantJoined]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};

export default JitsiMeeting;
