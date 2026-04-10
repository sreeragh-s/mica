import log from 'electron-log/main'
import { startApp } from './bootstrap/start-app'

log.initialize()
startApp()
