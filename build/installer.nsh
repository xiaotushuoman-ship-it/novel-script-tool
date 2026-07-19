!macro customCheckAppRunning
  DetailPrint "Closing running Xiaotu Assistant before installation."
  nsExec::ExecToLog 'taskkill /IM "${APP_EXECUTABLE_FILENAME}" /T'
  Sleep 1200
  nsExec::ExecToLog 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  Sleep 800
!macroend
